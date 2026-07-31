import type { CareerOpsDesktopApi } from './contracts';

declare global {
  interface Window {
    careerOps: CareerOpsDesktopApi;
  }
}

export {};
