// Vite inlines `?raw` imports as strings at build time (used for the bundled lock SQL).
declare module "*.sql?raw" {
  const sql: string;
  export default sql;
}
