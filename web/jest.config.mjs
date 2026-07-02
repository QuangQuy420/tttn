import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

// next/jest handles the SWC transform + env/CSS/asset mocks for us; we only need to layer
// jsdom, the RTL setup file, and the "@/*" path alias on top.
/** @type {import('jest').Config} */
const config = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
};

export default createJestConfig(config);
