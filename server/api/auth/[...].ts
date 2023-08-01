import { NuxtAuthHandler } from "#auth";
import _CredentialsProvider from "next-auth/providers/credentials";

const CredentialsProvider = (_CredentialsProvider as any)
  .default as typeof _CredentialsProvider;

export default NuxtAuthHandler({
  pages: {
    // Change the default behavior to use `/login` as the path for the sign-in page
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "WaniKani API key",
      credentials: {
        apiKey: {
          label: "API v2",
          type: "text",
          placeholder:
            "See https://www.wanikani.com/settings/personal_access_tokens",
        },
      },
      async authorize(cred, req) {
        console.log(cred);
        return null;
      },
    }),
  ],
  // A secret string you define, to ensure correct encryption - required in production
  secret: process.env.AUTH_SECRET || "1232",
});
