import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// cacheComponents выключен: почти все страницы персональные и читают сессию.
// Вернёмся к нему, когда появятся публичные страницы (лендинг, фаза 5).
const nextConfig: NextConfig = {
  // число воркеров сборки по свободной памяти, а не по ядрам: на 16 ядрах и малой свободной RAM сборка падала с OOM
  experimental: { memoryBasedWorkersCount: true },
  // локальный Supabase (site_url) возвращает на 127.0.0.1:3000, а dev-сервер по умолчанию пускает только localhost
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
