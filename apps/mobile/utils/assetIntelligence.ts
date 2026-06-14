import { AssetExecution, ItemHistoryEntry } from '../services/api';

export interface ScoreTrendAlert {
  level: 'danger' | 'warning';
  message: string;
}

const LOW_SCORE_THRESHOLD = 70;

/** Analisa as últimas execuções e retorna um alerta caso o score esteja baixo ou em queda */
export function analyzeScoreTrend(executions: AssetExecution[]): ScoreTrendAlert | null {
  const scored = executions.filter((e) => e.score !== null) as (AssetExecution & { score: number })[];
  if (scored.length === 0) return null;

  const [latest, previous] = scored;

  if (latest.score < LOW_SCORE_THRESHOLD) {
    return {
      level: 'danger',
      message: `Score baixo na última inspeção: ${latest.score}%`,
    };
  }

  if (previous && latest.score < previous.score) {
    return {
      level: 'warning',
      message: `Score em queda: ${previous.score}% → ${latest.score}%`,
    };
  }

  return null;
}

export interface RiskItem {
  message: string;
}

/** Itens do checklist que falharam (resposta != esperada) em alguma das últimas inspeções */
export function getRiskItems(
  itemHistory: ItemHistoryEntry[],
  checklistId: string,
): Map<string, RiskItem> {
  const risks = new Map<string, RiskItem>();

  for (const entry of itemHistory) {
    if (entry.checklistId !== checklistId) continue;

    const recent = entry.results.slice(0, 2);
    const failures = recent.filter((r) => r.answer !== null && r.answer !== entry.expectedAnswer);
    if (failures.length === 0) continue;

    risks.set(
      entry.checklistItemId,
      failures.length >= 2
        ? { message: 'Não conforme nas últimas 2 inspeções' }
        : { message: 'Não conforme na última inspeção' },
    );
  }

  return risks;
}

const STABLE_STREAK = 3;

/** Itens com resposta conforme/estável nas últimas inspeções: sugere a resposta esperada */
export function getSuggestedAnswers(
  itemHistory: ItemHistoryEntry[],
  checklistId: string,
): Map<string, boolean> {
  const suggestions = new Map<string, boolean>();

  for (const entry of itemHistory) {
    if (entry.checklistId !== checklistId) continue;

    const recent = entry.results.slice(0, STABLE_STREAK);
    if (recent.length < STABLE_STREAK) continue;

    const allMatch = recent.every((r) => r.answer === entry.expectedAnswer);
    if (allMatch) suggestions.set(entry.checklistItemId, entry.expectedAnswer);
  }

  return suggestions;
}
