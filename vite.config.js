import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Quan trọng: Phải để dấu gạch chéo ở đầu và cuối như thế này
  base: "/hotel-revenue-dashboard_DEXUAT/", 
});