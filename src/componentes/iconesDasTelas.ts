/**
 * O ÍCONE DE CADA TELA — o mesmo nas abas do assunto (ConteudoWeb) e nas
 * sugestões da busca (BuscaWeb). Dois mapas escritos à mão divergiriam no
 * primeiro ícone trocado.
 */
import {
  Home,
  Megaphone,
  Clock,
  Users,
  ListChecks,
  Network,
  QrCode,
  Send,
  CalendarDays,
  CalendarRange,
  Plane,
  Stethoscope,
  FolderOpen,
  PenLine,
  Receipt,
  TriangleAlert,
  Store,
  ShieldCheck,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react';
import type { TelaId } from '../servicos/telasPorAssunto';

export const ICONE_DA_TELA: Partial<Record<TelaId, LucideIcon>> = {
  inicio: Home,
  central: Megaphone,
  meu_ponto: Clock,
  equipe_banco: Users,
  equipe_pendencias: ListChecks,
  ponto_rede: Network,
  qr_ponto: QrCode,
  pedir_ausencia: Send,
  minhas_ausencias: CalendarDays,
  escala_folgas: CalendarRange,
  ferias_planejamento: Plane,
  atestados: Stethoscope,
  meus_documentos: FolderOpen,
  assinaturas: PenLine,
  holerites: Receipt,
  advertencias: TriangleAlert,
  unidades: Store,
  organograma: Network,
  administracao: ShieldCheck,
};

/** O ícone de quem não tem um próprio. */
export const ICONE_PADRAO_DA_TELA: LucideIcon = LayoutGrid;
