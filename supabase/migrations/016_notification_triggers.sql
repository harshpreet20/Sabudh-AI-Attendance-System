-- 016_notification_triggers.sql
-- Fan out an in-app notification for every meaningful student / discussion /
-- messaging action via database triggers. Because the triggers fire at the DB
-- layer, coverage is uniform whether the action came from a server route or a
-- direct client Supabase call. The client subscribes to the notifications table
-- over Realtime and raises a browser/PWA notification for each new row.

-- ---------------------------------------------------------------------------
-- Widen the allowed notification types.
-- ---------------------------------------------------------------------------
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check CHECK (type IN (
        'attendance_accepted', 'attendance_rejected', 'attendance_marked',
        'attendance_absent', 'attendance_reminder', 'attendance_window_open',
        'low_attendance', 'certificate_eligible', 'account_suspended',
        'account_restored', 'class_cancelled', 'schedule_updated',
        'correction_approved', 'correction_rejected', 'system', 'info',
        'discussion_reply', 'discussion_upvote', 'discussion_answer',
        'discussion_thread', 'message', 'leave_submitted', 'leave_reviewed',
        'announcement', 'assignment_new', 'assignment_graded',
        'submission_received', 'project_new', 'project_graded',
        'photo_reviewed', 'progress_review'
    ));

-- ---------------------------------------------------------------------------
-- Central helper: never let a notification failure block the triggering write.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_user_notification(
    p_user uuid, p_type text, p_title text, p_message text, p_meta jsonb DEFAULT '{}'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF p_user IS NULL THEN RETURN; END IF;
    INSERT INTO notifications(user_id, type, title, message, metadata)
    VALUES (p_user, p_type, p_title, p_message, COALESCE(p_meta, '{}'::jsonb));
EXCEPTION WHEN OTHERS THEN
    RETURN;
END;$$;

-- ===========================================================================
-- Discussion forum
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.notify_discussion_reply() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_thread_author uuid; v_thread_title text; v_parent_author uuid;
BEGIN
    SELECT author_id, title INTO v_thread_author, v_thread_title
    FROM discussion_threads WHERE id = NEW.thread_id;

    IF v_thread_author IS NOT NULL AND v_thread_author <> NEW.author_id THEN
        PERFORM create_user_notification(v_thread_author, 'discussion_reply',
            'New reply to your post',
            'Someone replied to "' || COALESCE(v_thread_title, 'your post') || '"',
            jsonb_build_object('thread_id', NEW.thread_id, 'reply_id', NEW.id));
    END IF;

    IF NEW.parent_reply_id IS NOT NULL THEN
        SELECT author_id INTO v_parent_author FROM discussion_replies WHERE id = NEW.parent_reply_id;
        IF v_parent_author IS NOT NULL
           AND v_parent_author <> NEW.author_id
           AND v_parent_author IS DISTINCT FROM v_thread_author THEN
            PERFORM create_user_notification(v_parent_author, 'discussion_reply',
                'New reply to your comment', 'Someone replied to your comment',
                jsonb_build_object('thread_id', NEW.thread_id, 'reply_id', NEW.id));
        END IF;
    END IF;
    RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_notify_discussion_reply ON discussion_replies;
CREATE TRIGGER trg_notify_discussion_reply AFTER INSERT ON discussion_replies
    FOR EACH ROW EXECUTE FUNCTION notify_discussion_reply();

CREATE OR REPLACE FUNCTION public.notify_discussion_answer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.is_answer IS TRUE AND COALESCE(OLD.is_answer, false) IS FALSE THEN
        PERFORM create_user_notification(NEW.author_id, 'discussion_answer',
            'Your reply was marked as the answer',
            'An instructor marked your reply as the accepted answer',
            jsonb_build_object('thread_id', NEW.thread_id, 'reply_id', NEW.id));
    END IF;
    RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_notify_discussion_answer ON discussion_replies;
CREATE TRIGGER trg_notify_discussion_answer AFTER UPDATE ON discussion_replies
    FOR EACH ROW EXECUTE FUNCTION notify_discussion_answer();

CREATE OR REPLACE FUNCTION public.notify_discussion_upvote() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_author uuid; v_title text;
BEGIN
    IF NEW.reply_id IS NOT NULL THEN
        SELECT author_id INTO v_author FROM discussion_replies WHERE id = NEW.reply_id;
        v_title := 'Your reply got an upvote';
    ELSIF NEW.thread_id IS NOT NULL THEN
        SELECT author_id INTO v_author FROM discussion_threads WHERE id = NEW.thread_id;
        v_title := 'Your post got an upvote';
    END IF;
    IF v_author IS NOT NULL AND v_author <> NEW.user_id THEN
        PERFORM create_user_notification(v_author, 'discussion_upvote', v_title,
            'You received an upvote on the discussion board',
            jsonb_build_object('thread_id', NEW.thread_id, 'reply_id', NEW.reply_id));
    END IF;
    RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_notify_discussion_upvote ON discussion_upvotes;
CREATE TRIGGER trg_notify_discussion_upvote AFTER INSERT ON discussion_upvotes
    FOR EACH ROW EXECUTE FUNCTION notify_discussion_upvote();

CREATE OR REPLACE FUNCTION public.notify_new_thread() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_instructor uuid;
BEGIN
    SELECT instructor_id INTO v_instructor FROM batches WHERE id = NEW.batch_id;
    IF v_instructor IS NOT NULL AND v_instructor <> NEW.author_id THEN
        PERFORM create_user_notification(v_instructor, 'discussion_thread',
            'New discussion posted', COALESCE(NEW.title, 'A new question was posted'),
            jsonb_build_object('thread_id', NEW.id, 'batch_id', NEW.batch_id));
    END IF;
    RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_notify_new_thread ON discussion_threads;
CREATE TRIGGER trg_notify_new_thread AFTER INSERT ON discussion_threads
    FOR EACH ROW EXECUTE FUNCTION notify_new_thread();

-- ===========================================================================
-- Direct messages
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.notify_direct_message() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p1 uuid; v_p2 uuid; v_recipient uuid; v_name text;
BEGIN
    SELECT participant_1, participant_2 INTO v_p1, v_p2
    FROM direct_message_channels WHERE id = NEW.channel_id;
    IF v_p1 IS NULL THEN RETURN NEW; END IF;
    v_recipient := CASE WHEN NEW.sender_id = v_p1 THEN v_p2 ELSE v_p1 END;

    SELECT full_name INTO v_name FROM student_profiles WHERE auth_user_id = NEW.sender_id;
    IF v_name IS NULL THEN
        SELECT full_name INTO v_name FROM teacher_profiles WHERE auth_user_id = NEW.sender_id;
    END IF;

    PERFORM create_user_notification(v_recipient, 'message',
        'New message' || COALESCE(' from ' || v_name, ''),
        LEFT(COALESCE(NEW.content, ''), 140),
        jsonb_build_object('channel_id', NEW.channel_id));
    RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_notify_direct_message ON direct_messages;
CREATE TRIGGER trg_notify_direct_message AFTER INSERT ON direct_messages
    FOR EACH ROW EXECUTE FUNCTION notify_direct_message();

-- ===========================================================================
-- Leave requests
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.notify_leave_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_instructor uuid; v_name text; v_org uuid; r record;
BEGIN
    SELECT instructor_id INTO v_instructor FROM batches WHERE id = NEW.batch_id;
    SELECT full_name, organization_id INTO v_name, v_org FROM student_profiles WHERE id = NEW.student_id;

    IF v_instructor IS NOT NULL THEN
        PERFORM create_user_notification(v_instructor, 'leave_submitted',
            'New leave request',
            COALESCE(v_name, 'A student') || ' requested leave for ' || to_char(NEW.leave_date, 'DD Mon'),
            jsonb_build_object('leave_id', NEW.id, 'student_id', NEW.student_id));
    END IF;

    FOR r IN
        SELECT user_id FROM user_roles
        WHERE role IN ('admin', 'super_admin') AND (v_org IS NULL OR organization_id = v_org)
    LOOP
        PERFORM create_user_notification(r.user_id, 'leave_submitted',
            'New leave request', COALESCE(v_name, 'A student') || ' requested leave',
            jsonb_build_object('leave_id', NEW.id, 'student_id', NEW.student_id));
    END LOOP;
    RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_notify_leave_insert ON leave_requests;
CREATE TRIGGER trg_notify_leave_insert AFTER INSERT ON leave_requests
    FOR EACH ROW EXECUTE FUNCTION notify_leave_insert();

CREATE OR REPLACE FUNCTION public.notify_leave_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'rejected') THEN
        SELECT auth_user_id INTO v_user FROM student_profiles WHERE id = NEW.student_id;
        PERFORM create_user_notification(v_user, 'leave_reviewed',
            'Leave request ' || NEW.status,
            'Your leave for ' || to_char(NEW.leave_date, 'DD Mon') || ' was ' || NEW.status,
            jsonb_build_object('leave_id', NEW.id, 'status', NEW.status));
    END IF;
    RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_notify_leave_update ON leave_requests;
CREATE TRIGGER trg_notify_leave_update AFTER UPDATE ON leave_requests
    FOR EACH ROW EXECUTE FUNCTION notify_leave_update();

-- ===========================================================================
-- Announcements  → all targeted active students
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.notify_announcement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT auth_user_id FROM student_profiles
        WHERE status = 'active'
          AND (
            (NEW.batch_id IS NULL AND organization_id = NEW.organization_id)
            OR batch_id = NEW.batch_id
          )
    LOOP
        PERFORM create_user_notification(r.auth_user_id, 'announcement',
            COALESCE(NEW.title, 'New announcement'), LEFT(COALESCE(NEW.content, ''), 140),
            jsonb_build_object('announcement_id', NEW.id));
    END LOOP;
    RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_notify_announcement ON announcements;
CREATE TRIGGER trg_notify_announcement AFTER INSERT ON announcements
    FOR EACH ROW EXECUTE FUNCTION notify_announcement();

-- ===========================================================================
-- Assignments & submissions
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.notify_assignment_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
    IF NEW.status = 'active' THEN
        FOR r IN SELECT auth_user_id FROM student_profiles WHERE batch_id = NEW.batch_id AND status = 'active'
        LOOP
            PERFORM create_user_notification(r.auth_user_id, 'assignment_new',
                'New assignment', COALESCE(NEW.title, 'A new assignment was posted'),
                jsonb_build_object('assignment_id', NEW.id));
        END LOOP;
    END IF;
    RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_notify_assignment_insert ON assignments;
CREATE TRIGGER trg_notify_assignment_insert AFTER INSERT ON assignments
    FOR EACH ROW EXECUTE FUNCTION notify_assignment_insert();

CREATE OR REPLACE FUNCTION public.notify_submission_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_instr uuid; v_title text; v_name text;
BEGIN
    SELECT instructor_id, title INTO v_instr, v_title FROM assignments WHERE id = NEW.assignment_id;
    SELECT full_name INTO v_name FROM student_profiles WHERE id = NEW.student_id;
    PERFORM create_user_notification(v_instr, 'submission_received',
        'New submission',
        COALESCE(v_name, 'A student') || ' submitted "' || COALESCE(v_title, 'an assignment') || '"',
        jsonb_build_object('assignment_id', NEW.assignment_id, 'submission_id', NEW.id));
    RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_notify_submission_insert ON assignment_submissions;
CREATE TRIGGER trg_notify_submission_insert AFTER INSERT ON assignment_submissions
    FOR EACH ROW EXECUTE FUNCTION notify_submission_insert();

CREATE OR REPLACE FUNCTION public.notify_submission_graded() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
    IF (NEW.status = 'graded' AND COALESCE(OLD.status, '') <> 'graded')
       OR (NEW.score IS NOT NULL AND OLD.score IS NULL) THEN
        SELECT auth_user_id INTO v_user FROM student_profiles WHERE id = NEW.student_id;
        PERFORM create_user_notification(v_user, 'assignment_graded',
            'Assignment graded',
            'Your submission was graded' || CASE WHEN NEW.score IS NOT NULL THEN ' — score ' || NEW.score ELSE '' END,
            jsonb_build_object('assignment_id', NEW.assignment_id, 'submission_id', NEW.id));
    END IF;
    RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_notify_submission_graded ON assignment_submissions;
CREATE TRIGGER trg_notify_submission_graded AFTER UPDATE ON assignment_submissions
    FOR EACH ROW EXECUTE FUNCTION notify_submission_graded();

-- ===========================================================================
-- Projects & project submissions
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.notify_project_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
    IF NEW.status = 'active' THEN
        FOR r IN SELECT auth_user_id FROM student_profiles WHERE batch_id = NEW.batch_id AND status = 'active'
        LOOP
            PERFORM create_user_notification(r.auth_user_id, 'project_new',
                'New project', COALESCE(NEW.title, 'A new project was posted'),
                jsonb_build_object('project_id', NEW.id));
        END LOOP;
    END IF;
    RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_notify_project_insert ON projects;
CREATE TRIGGER trg_notify_project_insert AFTER INSERT ON projects
    FOR EACH ROW EXECUTE FUNCTION notify_project_insert();

CREATE OR REPLACE FUNCTION public.notify_project_graded() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
    IF (NEW.status = 'graded' AND COALESCE(OLD.status, '') <> 'graded')
       OR (NEW.score IS NOT NULL AND OLD.score IS NULL) THEN
        SELECT auth_user_id INTO v_user FROM student_profiles WHERE id = NEW.student_id;
        PERFORM create_user_notification(v_user, 'project_graded',
            'Project graded',
            'Your project submission was graded' || CASE WHEN NEW.score IS NOT NULL THEN ' — score ' || NEW.score ELSE '' END,
            jsonb_build_object('project_id', NEW.project_id, 'submission_id', NEW.id));
    END IF;
    RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_notify_project_graded ON project_submissions;
CREATE TRIGGER trg_notify_project_graded AFTER UPDATE ON project_submissions
    FOR EACH ROW EXECUTE FUNCTION notify_project_graded();

-- ===========================================================================
-- Profile photo requests & progress reviews
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.notify_photo_reviewed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'rejected') THEN
        PERFORM create_user_notification(NEW.auth_user_id, 'photo_reviewed',
            'Photo request ' || NEW.status,
            'Your profile photo change was ' || NEW.status,
            jsonb_build_object('request_id', NEW.id, 'status', NEW.status));
    END IF;
    RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_notify_photo_reviewed ON profile_photo_requests;
CREATE TRIGGER trg_notify_photo_reviewed AFTER UPDATE ON profile_photo_requests
    FOR EACH ROW EXECUTE FUNCTION notify_photo_reviewed();

CREATE OR REPLACE FUNCTION public.notify_progress_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
    SELECT auth_user_id INTO v_user FROM student_profiles WHERE id = NEW.student_id;
    PERFORM create_user_notification(v_user, 'progress_review',
        'New progress review', 'Your instructor added a progress review for you',
        jsonb_build_object('review_id', NEW.id));
    RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_notify_progress_review ON progress_reviews;
CREATE TRIGGER trg_notify_progress_review AFTER INSERT ON progress_reviews
    FOR EACH ROW EXECUTE FUNCTION notify_progress_review();

-- ---------------------------------------------------------------------------
-- Ensure the notifications table streams over Realtime for the client listener.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    END IF;
END$$;
