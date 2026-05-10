/**
 * Formata CNPJ: '00000000000100' → '00.000.000/0001-00'
 */
export function formatCNPJ(cnpj: string): string {
  const cleaned = cnpj.replace(/\D/g, '');
  return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

/**
 * Formata telefone: '11999990001' → '(11) 99999-0001'
 */
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
}

/**
 * Gera URL de dados QR Code para um asset
 */
export function generateQRCodeData(assetId: string, companyId: string): string {
  return `visao360://asset/${companyId}/${assetId}`;
}

/**
 * Pagina um array em memória
 */
export function paginate<T>(
  items: T[],
  page: number,
  limit: number,
): { data: T[]; total: number; page: number; limit: number; totalPages: number } {
  const total = items.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  return { data: items.slice(start, start + limit), total, page, limit, totalPages };
}

/**
 * Retorna label de prioridade em português
 */
export function priorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    LOW: 'Baixa',
    MEDIUM: 'Média',
    HIGH: 'Alta',
    CRITICAL: 'Crítica',
  };
  return labels[priority] ?? priority;
}

/**
 * Retorna label de status de OS em português
 */
export function workOrderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    OPEN: 'Aberta',
    ASSIGNED: 'Atribuída',
    IN_PROGRESS: 'Em andamento',
    WAITING_PARTS: 'Aguardando peças',
    COMPLETED: 'Concluída',
    CANCELLED: 'Cancelada',
  };
  return labels[status] ?? status;
}

/**
 * Retorna label de status de asset em português
 */
export function assetStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    ACTIVE: 'Ativo',
    INACTIVE: 'Inativo',
    MAINTENANCE: 'Em manutenção',
    DECOMMISSIONED: 'Desativado',
  };
  return labels[status] ?? status;
}

/**
 * Verifica se uma data de manutenção está vencida ou próxima (em dias)
 */
export function getMaintenanceAlert(
  nextMaintenanceAt: Date | string | null,
  warningDays = 7,
): 'overdue' | 'warning' | 'ok' | null {
  if (!nextMaintenanceAt) return null;
  const diff = new Date(nextMaintenanceAt).getTime() - Date.now();
  const days = diff / (1000 * 60 * 60 * 24);
  if (days < 0) return 'overdue';
  if (days <= warningDays) return 'warning';
  return 'ok';
}
