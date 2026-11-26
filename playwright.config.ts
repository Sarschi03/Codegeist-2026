import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'tests/e2e',timeout:45_000,fullyParallel:true,
  use:{baseURL:'http://localhost:4173',viewport:{width:1440,height:900},trace:'retain-on-failure'},
  webServer:{command:'npm run dev -- --port 4173 --strictPort',url:'http://localhost:4173',reuseExistingServer:false,
    env:{VITE_TRACE_CONVEX:process.env.TRACE_TEST_CONVEX==='true'?'true':'false'}},
});
