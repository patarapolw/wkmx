// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  nitro: {
    storage: {
      db: {
        driver: "fs",
        base: "./data/db",
      },
    },
  },
});
