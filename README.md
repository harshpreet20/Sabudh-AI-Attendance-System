This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## PWA & Push Notifications

The app is an installable PWA and supports Web Push notifications.

**Install:** an "Install app" button appears in the sidebar and under
Settings once the browser reports the app is installable (one-tap on
Android/Chrome; iOS Safari shows Add-to-Home-Screen instructions).

**Enable push (one-time setup):**

1. Apply the database migration `supabase/migrations/014_push_subscriptions.sql`
   to your Supabase project.
2. Generate a VAPID key pair:

   ```bash
   npx web-push generate-vapid-keys
   ```

3. Set the following environment variables (e.g. in Vercel), then redeploy:

   | Variable | Notes |
   | --- | --- |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | The VAPID **public** key (exposed to the browser). |
   | `VAPID_PUBLIC_KEY` | Same public key (server side). |
   | `VAPID_PRIVATE_KEY` | The VAPID **private** key. Keep secret. |
   | `VAPID_SUBJECT` | Contact URL, e.g. `mailto:admin@sabudh.org`. Optional. |
   | `SUPABASE_SERVICE_ROLE_KEY` | Already required; used to deliver pushes. |

Until the keys are set, push is disabled gracefully — the toggle shows as
unavailable and notification sends are skipped. Users opt in per device from
**Settings → Push Notifications**, and a "Send test" button confirms delivery.
Any notification created via `sendNotification()` (`src/lib/notify.ts`) is
delivered both in-app and as a push.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
