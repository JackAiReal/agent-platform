import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

function getPackageName(id: string): string | null {
  const normalized = id.replace(/\\/g, "/");
  const marker = "/node_modules/";
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex === -1) {
    return null;
  }

  const packagePath = normalized.slice(markerIndex + marker.length);
  const parts = packagePath.split("/");
  if (parts[0]?.startsWith("@") && parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0] || null;
}

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          const packageName = getPackageName(id);
          if (!packageName) {
            return "vendor";
          }

          if (packageName === "react" || packageName === "react-dom" || packageName === "scheduler") {
            return "react-vendor";
          }

          if (packageName === "@ant-design/icons" || packageName === "@ant-design/icons-svg") {
            return "icons-vendor";
          }

          if (
            packageName.startsWith("rc-") ||
            packageName.startsWith("@rc-component/") ||
            packageName.startsWith("@ant-design/") ||
            packageName === "@emotion" ||
            packageName.startsWith("@emotion/") ||
            packageName === "dayjs"
          ) {
            return "ant-shared";
          }

          if (packageName === "antd") {
            return "antd-vendor";
          }

          return "vendor";
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 8173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8318",
        changeOrigin: true,
      },
    },
  },
});
