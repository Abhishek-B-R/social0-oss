export default {
  projects: [
    {
      displayName: "unit",
      testEnvironment: "node",
      testMatch: ["**/__tests__/lib/**/*.test.ts"],
      transform: { "^.+\\.tsx?$": "ts-jest" },
      moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
    },
    {
      displayName: "components",
      testEnvironment: "jsdom",
      testMatch: ["**/__tests__/components/**/*.test.tsx"],
      transform: { "^.+\\.tsx?$": "ts-jest" },
      setupFilesAfterEnv: ["@testing-library/jest-dom"],
      moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
    },
    {
      displayName: "api",
      testEnvironment: "node",
      testMatch: ["**/__tests__/api/**/*.test.ts"],
      transform: { "^.+\\.tsx?$": "ts-jest" },
      moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
    },
  ],
};
