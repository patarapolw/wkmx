// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ["@vite-pwa/nuxt", "@sidebase/nuxt-auth"],
  auth: {
    globalAppMiddleware: true,
  },
  nitro: {
    storage: {
      db: {
        driver: "mongodb",
        connectionString: process.env["MONGO_URI"],
      },
    },
  },
});
