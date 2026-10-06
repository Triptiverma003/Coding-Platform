// src/services/execution.ts — temporary mock version
export interface ExecutionResult {
  passed: boolean;
  testCasesPassed: number;
  totalTestCases: number;
}

export async function runAgainstTestCases(
  code: string,
  language: string,
  testCases: unknown[]
): Promise<ExecutionResult> {
  // TEMP: fakes execution so we can test the socket/winner flow
  // without depending on the real Piston API yet
  const totalTestCases = testCases.length;
  const testCasesPassed = Math.random() > 0.3 ? totalTestCases : Math.floor(Math.random() * totalTestCases);

  return {
    passed: testCasesPassed === totalTestCases,
    testCasesPassed,
    totalTestCases,
  };
}