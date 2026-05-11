export const env = {
  port: Number(Bun.env.PORT ?? 3000),
  adminPassword: Bun.env.ADMIN_PASSWORD ?? "$$",
  groupSize: Number(Bun.env.GROUP_SIZE ?? 10)
};
