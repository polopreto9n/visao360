import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private fromAddress: string;
  private enabled: boolean;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    const port = config.get<number>('SMTP_PORT', 587);
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    this.fromAddress = config.get<string>('EMAIL_FROM', 'Visão360 <noreply@visao360.com.br>');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      this.enabled = true;
      this.logger.log(`Email configurado: ${host}:${port}`);
    } else {
      this.enabled = false;
      this.logger.warn('Email não configurado — defina SMTP_HOST, SMTP_USER, SMTP_PASS no .env');
    }
  }

  async send(options: SendEmailOptions): Promise<boolean> {
    if (!this.transporter || !this.enabled) return false;

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        html: options.html,
        text: options.text ?? options.html.replace(/<[^>]+>/g, ''),
      });
      this.logger.log(`Email enviado para: ${options.to} | ${options.subject}`);
      return true;
    } catch (err) {
      this.logger.error(`Falha ao enviar email: ${String(err)}`);
      return false;
    }
  }

  // ─── Templates ────────────────────────────────────────────────────────────────

  async sendWorkOrderAssigned(params: {
    to: string; name: string; woCode: string; woTitle: string;
    priority: string; dueDate?: string; companyName: string;
  }) {
    const priorityColors: Record<string, string> = {
      CRITICAL: '#dc2626', HIGH: '#ea580c', MEDIUM: '#d97706', LOW: '#16a34a',
    };
    const color = priorityColors[params.priority] ?? '#6b7280';

    return this.send({
      to: params.to,
      subject: `[OS ATRIBUÍDA] ${params.woCode} — ${params.woTitle}`,
      html: emailLayout({
        title: 'Nova OS Atribuída',
        companyName: params.companyName,
        body: `
          <p style="font-size:16px;color:#374151">Olá, <strong>${params.name}</strong>!</p>
          <p style="color:#6b7280">Uma nova Ordem de Serviço foi atribuída a você:</p>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:20px 0">
            <div style="font-family:monospace;color:#6b7280;font-size:13px">${params.woCode}</div>
            <div style="font-size:18px;font-weight:700;color:#111827;margin:8px 0">${params.woTitle}</div>
            <div style="display:inline-block;background:${color}20;color:${color};font-weight:700;padding:4px 12px;border-radius:20px;font-size:13px">
              Prioridade: ${params.priority}
            </div>
            ${params.dueDate ? `<div style="margin-top:8px;color:#6b7280;font-size:13px">📅 Prazo: <strong>${params.dueDate}</strong></div>` : ''}
          </div>

          <p style="color:#6b7280">Acesse o Visão360 para ver os detalhes e iniciar o atendimento.</p>
        `,
      }),
    });
  }

  async sendIncidentAlert(params: {
    to: string[]; incidentTitle: string; severity: string;
    unitName: string; reporterName: string; companyName: string;
  }) {
    const sevColors: Record<string, string> = {
      CRITICAL: '#dc2626', HIGH: '#ea580c', MEDIUM: '#d97706', LOW: '#16a34a',
    };
    const color = sevColors[params.severity] ?? '#6b7280';
    const isUrgent = ['CRITICAL', 'HIGH'].includes(params.severity);

    return this.send({
      to: params.to,
      subject: `${isUrgent ? '🚨 ' : '⚠️ '}[INCIDENTE ${params.severity}] ${params.incidentTitle}`,
      html: emailLayout({
        title: `Novo Incidente Registrado`,
        companyName: params.companyName,
        body: `
          <div style="background:${color}15;border-left:4px solid ${color};padding:16px;border-radius:8px;margin-bottom:20px">
            <div style="color:${color};font-weight:700;font-size:14px">SEVERIDADE ${params.severity}</div>
            <div style="font-size:18px;font-weight:700;color:#111827;margin-top:4px">${params.incidentTitle}</div>
          </div>

          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Unidade:</td>
                <td style="padding:8px 0;font-weight:600;color:#111827">${params.unitName}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Reportado por:</td>
                <td style="padding:8px 0;font-weight:600;color:#111827">${params.reporterName}</td></tr>
          </table>

          ${isUrgent ? '<p style="color:#dc2626;font-weight:600;margin-top:16px">⚡ Este incidente requer atenção imediata!</p>' : ''}
        `,
      }),
    });
  }

  async sendLowScoreExecution(params: {
    to: string[]; checklistName: string; score: number;
    technicianName: string; assetName?: string; companyName: string;
  }) {
    return this.send({
      to: params.to,
      subject: `⚠️ [CHECKLIST] Baixa conformidade: ${params.score}% — ${params.checklistName}`,
      html: emailLayout({
        title: 'Checklist com Baixa Conformidade',
        companyName: params.companyName,
        body: `
          <p style="color:#6b7280">Um checklist foi concluído com score abaixo do esperado:</p>

          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;margin:20px 0;text-align:center">
            <div style="font-size:48px;font-weight:900;color:#dc2626">${params.score}%</div>
            <div style="color:#dc2626;font-weight:600;margin-top:4px">de conformidade</div>
            <div style="color:#374151;font-weight:600;margin-top:12px">${params.checklistName}</div>
            ${params.assetName ? `<div style="color:#6b7280;font-size:13px;margin-top:4px">${params.assetName}</div>` : ''}
          </div>

          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Técnico:</td>
                <td style="padding:8px 0;font-weight:600;color:#111827">${params.technicianName}</td></tr>
          </table>

          <p style="color:#6b7280;margin-top:16px">Revise os itens não conformes e abra uma OS se necessário.</p>
        `,
      }),
    });
  }

  async sendWorkOrderOverdue(params: {
    to: string[]; woCode: string; woTitle: string;
    dueDate: string; assigneeName?: string; companyName: string;
  }) {
    return this.send({
      to: params.to,
      subject: `🔴 [OS VENCIDA] ${params.woCode} — ${params.woTitle}`,
      html: emailLayout({
        title: 'Ordem de Serviço Vencida',
        companyName: params.companyName,
        body: `
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;margin-bottom:20px">
            <div style="font-family:monospace;color:#6b7280;font-size:13px">${params.woCode}</div>
            <div style="font-size:18px;font-weight:700;color:#dc2626;margin:8px 0">${params.woTitle}</div>
            <div style="color:#dc2626;font-size:14px">⚠️ Venceu em: <strong>${params.dueDate}</strong></div>
            ${params.assigneeName ? `<div style="color:#6b7280;font-size:13px;margin-top:4px">Técnico: ${params.assigneeName}</div>` : ''}
          </div>
          <p style="color:#6b7280">Esta OS precisa ser atendida ou renegociada com urgência.</p>
        `,
      }),
    });
  }

  async sendWelcome(params: {
    to: string; name: string; companyName: string; trialDays: number;
  }) {
    return this.send({
      to: params.to,
      subject: `Bem-vindo ao Visão360, ${params.name}! 🎉`,
      html: emailLayout({
        title: `Bem-vindo ao Visão360!`,
        companyName: params.companyName,
        body: `
          <p style="font-size:16px;color:#374151">Olá, <strong>${params.name}</strong>!</p>
          <p style="color:#6b7280">Sua conta foi criada com sucesso. Você tem <strong>${params.trialDays} dias</strong> para explorar todas as funcionalidades do Visão360 gratuitamente.</p>

          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:20px;margin:20px 0">
            <h3 style="color:#1e40af;margin:0 0 12px;font-size:15px">O que você pode fazer:</h3>
            <ul style="color:#374151;font-size:14px;margin:0;padding-left:20px;line-height:1.8">
              <li>Cadastrar equipamentos e criar QR Codes</li>
              <li>Criar checklists de manutenção preventiva</li>
              <li>Abrir e gerenciar Ordens de Serviço</li>
              <li>Registrar e acompanhar ocorrências</li>
              <li>Controlar documentos com vencimento</li>
            </ul>
          </div>

          <p style="color:#6b7280">Acesse o painel agora e comece a organizar a gestão do seu condomínio!</p>
          <div style="text-align:center;margin:24px 0">
            <a href="https://app.visao360.com.br/dashboard" style="background:#2563eb;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">Acessar o painel →</a>
          </div>
        `,
      }),
    });
  }

  async sendTrialExpiring(params: {
    to: string; name: string; companyName: string; daysLeft: number;
  }) {
    const urgent = params.daysLeft <= 3;
    return this.send({
      to: params.to,
      subject: `${urgent ? '⚠️ ' : ''}Seu período de avaliação encerra em ${params.daysLeft} dia(s)`,
      html: emailLayout({
        title: urgent ? 'Avaliação Encerrando!' : 'Período de Avaliação',
        companyName: params.companyName,
        body: `
          <p style="font-size:16px;color:#374151">Olá, <strong>${params.name}</strong>!</p>
          <div style="background:${urgent ? '#fef2f2' : '#fffbeb'};border:1px solid ${urgent ? '#fecaca' : '#fde68a'};border-radius:12px;padding:20px;margin:20px 0;text-align:center">
            <div style="font-size:40px;font-weight:900;color:${urgent ? '#dc2626' : '#d97706'}">${params.daysLeft}</div>
            <div style="color:${urgent ? '#dc2626' : '#92400e'};font-weight:600">dia(s) restante(s) no período gratuito</div>
          </div>
          <p style="color:#6b7280">Para continuar usando o Visão360 sem interrupção, escolha o plano ideal para sua operação.</p>
          <div style="text-align:center;margin:24px 0">
            <a href="https://app.visao360.com.br/planos" style="background:#2563eb;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">Ver planos e preços →</a>
          </div>
          <p style="color:#9ca3af;font-size:13px;text-align:center">Dúvidas? Responda este email ou acesse nosso suporte.</p>
        `,
      }),
    });
  }

  async sendWeeklySummary(params: {
    to: string; name: string; companyName: string;
    openWOs: number; completedWOs: number; openIncidents: number;
    overdueWOs: number; pendingChecklists: number;
  }) {
    const { openWOs, completedWOs, openIncidents, overdueWOs, pendingChecklists } = params;
    const hasAlerts = overdueWOs > 0 || openIncidents > 0;

    return this.send({
      to: params.to,
      subject: `📊 Resumo semanal — ${params.companyName}`,
      html: emailLayout({
        title: 'Resumo da Semana',
        companyName: params.companyName,
        body: `
          <p style="color:#6b7280">Olá, <strong>${params.name}</strong>! Veja o resumo operacional da semana:</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0">
            <tr>
              <td width="50%" style="padding:8px 8px 8px 0">
                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;text-align:center">
                  <div style="font-size:28px;font-weight:900;color:#16a34a">${completedWOs}</div>
                  <div style="color:#15803d;font-size:13px;margin-top:4px">OS Concluídas</div>
                </div>
              </td>
              <td width="50%" style="padding:8px 0 8px 8px">
                <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px;text-align:center">
                  <div style="font-size:28px;font-weight:900;color:#2563eb">${openWOs}</div>
                  <div style="color:#1d4ed8;font-size:13px;margin-top:4px">OS Em Aberto</div>
                </div>
              </td>
            </tr>
            <tr>
              <td width="50%" style="padding:8px 8px 8px 0">
                <div style="background:${overdueWOs > 0 ? '#fef2f2' : '#f8fafc'};border:1px solid ${overdueWOs > 0 ? '#fecaca' : '#e2e8f0'};border-radius:12px;padding:16px;text-align:center">
                  <div style="font-size:28px;font-weight:900;color:${overdueWOs > 0 ? '#dc2626' : '#6b7280'}">${overdueWOs}</div>
                  <div style="color:${overdueWOs > 0 ? '#dc2626' : '#6b7280'};font-size:13px;margin-top:4px">OS Vencidas</div>
                </div>
              </td>
              <td width="50%" style="padding:8px 0 8px 8px">
                <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px;text-align:center">
                  <div style="font-size:28px;font-weight:900;color:#d97706">${openIncidents}</div>
                  <div style="color:#92400e;font-size:13px;margin-top:4px">Ocorrências Abertas</div>
                </div>
              </td>
            </tr>
          </table>

          ${pendingChecklists > 0 ? `<p style="color:#d97706;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:14px">
            📋 <strong>${pendingChecklists} checklist(s)</strong> com execução pendente nesta semana.
          </p>` : ''}

          ${hasAlerts ? `<p style="color:#dc2626;font-size:14px">⚠️ Sua atenção é necessária nos itens em vermelho acima.</p>` : '<p style="color:#16a34a;font-size:14px">✅ Operação sem pendências críticas esta semana!</p>'}

          <div style="text-align:center;margin:24px 0">
            <a href="https://app.visao360.com.br/dashboard" style="background:#2563eb;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">Ver painel completo →</a>
          </div>
        `,
      }),
    });
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

// ─── Layout HTML base ─────────────────────────────────────────────────────────

function emailLayout(params: { title: string; companyName: string; body: string }): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
        <!-- Header -->
        <tr>
          <td style="background:#1e40af;padding:24px 32px;border-radius:12px 12px 0 0">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="display:inline-block;background:#3b82f6;border-radius:8px;width:36px;height:36px;text-align:center;line-height:36px;font-weight:900;color:white;font-size:18px">V</span>
                  <span style="font-size:18px;font-weight:800;color:white;margin-left:10px;vertical-align:middle">Visão360</span>
                </td>
                <td align="right" style="color:#93c5fd;font-size:13px">${params.companyName}</td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:white;padding:32px;border-radius:0 0 12px 12px;box-shadow:0 4px 6px rgba(0,0,0,0.05)">
            <h1 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 16px">${params.title}</h1>
            ${params.body}
            <hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0">
            <p style="color:#9ca3af;font-size:12px;margin:0">
              Este é um email automático do Visão360. Não responda este email.<br>
              © ${new Date().getFullYear()} Visão360 — Gestão Predial Inteligente
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
