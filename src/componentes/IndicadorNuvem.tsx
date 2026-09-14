/**
 * Indicador do modo de operação — CONECTA / Malachias Autopeças
 *
 * Mostra se o sistema está guardando os dados só neste navegador ou se está
 * ligado ao banco da rede. É importante ficar visível: no modo local, o que
 * um funcionário faz não chega a ninguém, e isso não pode ser uma surpresa.
 */

import React, { useEffect, useState } from 'react';
import { Cloud, CloudOff, AlertTriangle, Loader2 } from 'lucide-react';
import { usandoNuvem, verificarConexao, EstadoConexaoNuvem } from '../servicos/supabase';

export const IndicadorNuvem: React.FC = () => {
  const [estado, setEstado] = useState<EstadoConexaoNuvem>(
    usandoNuvem() ? 'conectando' : 'local'
  );
  const [erro, setErro] = useState<string | undefined>();

  useEffect(() => {
    if (!usandoNuvem()) return;

    let cancelado = false;
    verificarConexao().then((res) => {
      if (cancelado) return;
      setEstado(res.estado);
      setErro(res.erro);
    });

    return () => {
      cancelado = true;
    };
  }, []);

  const aparencia = {
    local: {
      Icone: CloudOff,
      rotulo: 'Local',
      titulo:
        'Modo local: os dados ficam apenas neste navegador e não são vistos pelas outras lojas.',
      classe: 'text-amber-600 bg-amber-500/10 border-amber-500/25',
    },
    conectando: {
      Icone: Loader2,
      rotulo: 'Conectando',
      titulo: 'Verificando a conexão com o banco da rede…',
      classe: 'text-[var(--c-texto-3)] bg-[var(--c-superficie-2)] border-[var(--c-borda)]',
    },
    conectado: {
      Icone: Cloud,
      rotulo: 'Rede',
      titulo: 'Conectado ao banco: todas as lojas enxergam a mesma informação.',
      classe: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/25',
    },
    erro: {
      Icone: AlertTriangle,
      rotulo: 'Sem conexão',
      titulo: erro || 'Não foi possível falar com o banco da rede.',
      classe: 'text-red-600 bg-red-500/10 border-red-500/25',
    },
  }[estado];

  const { Icone } = aparencia;

  return (
    <span
      id="indicador-modo-nuvem"
      title={aparencia.titulo}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${aparencia.classe}`}
    >
      <Icone className={`w-3 h-3 ${estado === 'conectando' ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">{aparencia.rotulo}</span>
    </span>
  );
};
