const { join } = require("node:path");

module.exports = ({ env }) => {
  const client = env("DATABASE_CLIENT", "sqlite");
  if (client === "postgres") {
    return {
      connection: {
        client,
        connection: {
          connectionString: env("DATABASE_URL"),
          host: env("DATABASE_HOST", "127.0.0.1"),
          port: env.int("DATABASE_PORT", 5432),
          database: env("DATABASE_NAME", "strapi"),
          user: env("DATABASE_USERNAME", "strapi"),
          password: env("DATABASE_PASSWORD", "strapi"),
        },
      },
    };
  }
  const ephemeral = join(
    __dirname,
    "..",
    ".tmp",
    `fixture-${process.pid}.sqlite`,
  );
  const filename = env("DATABASE_FILENAME", ephemeral);
  return {
    connection: {
      client,
      connection: { filename },
      useNullAsDefault: true,
      pool: { min: 1, max: 1 },
    },
  };
};
