import type {
  JobEvaluationError,
  JobEvaluationRequest,
  JobEvaluationRunResult,
} from './contracts';
import { getAiCredentials } from './ai-settings-store';
import { loadJobSource } from './job-source';
import { evaluateWithModel } from './job-model-runner';
import { writeEvaluationReport } from './job-report-writer';

function failure(error: unknown, stage: JobEvaluationError['stage'], code: string): JobEvaluationRunResult {
  const message = error instanceof Error ? error.message : '未知错误。';
  return {
    ok: false,
    error: {
      stage,
      code,
      message,
      detail: message,
    },
  };
}

function validateRequest(request: JobEvaluationRequest): JobEvaluationRequest {
  if (!request || typeof request !== 'object') throw new Error('评估请求格式无效。');
  if (!['url', 'jd'].includes(request.inputKind)) throw new Error('请选择 URL 或 JD 输入方式。');
  if (typeof request.input !== 'string' || !request.input.trim()) throw new Error('请输入岗位 URL 或 JD。');
  return { inputKind: request.inputKind, input: request.input };
}

export async function runJobEvaluation(
  root: string,
  request: JobEvaluationRequest,
): Promise<Omit<JobEvaluationRunResult & { ok: true }, 'snapshot'> | JobEvaluationRunResult> {
  let validated: JobEvaluationRequest;
  try {
    validated = validateRequest(request);
  } catch (error) {
    return failure(error, 'input', 'invalid_input');
  }

  let credentials;
  try {
    credentials = await getAiCredentials();
  } catch (error) {
    return failure(error, 'settings', 'model_not_configured');
  }

  let source;
  try {
    source = await loadJobSource(root, validated.inputKind, validated.input);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const stage = /失效|确认岗位|存活/.test(message) ? 'liveness'
      : /页面|提取|加载/.test(message) ? 'extraction'
        : 'input';
    return failure(error, stage, stage === 'liveness' ? 'liveness_gate_failed' : 'source_load_failed');
  }

  let draft;
  try {
    draft = await evaluateWithModel(root, source, credentials);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const stage = /JSON|Block|分数|证据|格式/.test(message) ? 'validation' : 'model';
    return failure(error, stage, stage === 'validation' ? 'invalid_model_output' : 'model_request_failed');
  }

  try {
    const evaluation = await writeEvaluationReport(root, draft, source);
    return { ok: true, evaluation } as Omit<JobEvaluationRunResult & { ok: true }, 'snapshot'>;
  } catch (error) {
    return failure(error, 'report', 'report_write_failed');
  }
}
