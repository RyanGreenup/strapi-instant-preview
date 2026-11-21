module.exports = ({ env }) => ({
  "openapi-contract": {
    enabled: true,
    resolve:
      require.resolve("@ryangreenup/strapi-typed-openapi-spec/package.json"),
    config: { exposeSpec: env.bool("FIXTURE_EXPOSE_SPEC", false) },
  },
  "users-permissions": {
    enabled: true,
    resolve: require.resolve("@strapi/plugin-users-permissions/package.json"),
    config: { jwtSecret: "fixture-jwt-secret", jwtManagement: "refresh" },
  },
});
