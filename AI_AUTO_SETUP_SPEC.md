# Configuração Inteligente da Bicicleta (AI Auto Setup) — Spec v1

_Revista a 2026-08-09. Decisões fechadas com o Miguel; substitui as linhas guia originais._

## Objetivo

Criar uma bicicleta praticamente com um clique: o utilizador indica **Marca, Modelo, Versão (opcional) e Ano**, e a Bikit identifica a bicicleta, cria os componentes e aplica os intervalos de manutenção.

Funcionalidade **Premium** (Personal e Pro). O Free não tem acesso — coerente também com os limites (1 bicicleta / 2 componentes nunca acomodariam uma configuração completa).

## Princípio central: dois catálogos, um padrão

São **dois catálogos partilhados** com exatamente o mesmo padrão — lookup primeiro, IA só quando não existe, persistência sempre pela app:

| Catálogo | Chave | Conteúdo |
|---|---|---|
| **Bike Catalog** | marca + modelo + versão + ano (normalizados) | lista de componentes da bicicleta |
| **Maintenance Catalog** | marca + modelo do componente (normalizados, sem variante) + ano opcional | todos os intervalos de manutenção documentados |

A IA **nunca inventa** informação e **nunca escreve na base de dados**. O seu papel é pesquisar fontes oficiais, extrair, estruturar e citar a origem. Com o crescimento da plataforma os dois catálogos enchem e o custo de IA tende para zero — componentes comuns (FOX 38, Code RSC, GX Transmission) repetem-se em quase todas as bicicletas, por isso o Maintenance Catalog enche primeiro e mais depressa.

## Fluxo

### 1. Introdução dos dados

Marca, Modelo, Versão (opcional), Ano → botão **✨ Configuração Inteligente**.

**O ano é obrigatório e limitado a 2010–(ano atual + 1)** (2026-08-09): abaixo disso uma pesquisa paga vem quase de certeza vazia — fichas antigas saem do ar. O `+1` existe porque a indústria lança os modelos do ano seguinte a meio do ano (uma "2027" está à venda em setembro de 2026). É proteção de custo tanto como validação, aplicada no formulário e nos dois schemas do servidor.

O lookup normaliza a chave (lowercase, trim, sem acentos) e a marca é ancorada na lista do BikeIndex que a app já usa, para absorver variações de escrita ("yt" / "YT Industries").

### 2. Bike Catalog hit

Se a bicicleta existe no catálogo: carrega a configuração, salta direto para o **preview** (passo 5). Custo de IA zero. Lookups ao catálogo **não contam para a quota**.

### 3. Bike Catalog miss → IA

- **OpenAI Responses API** com a ferramenta **`web_search`** (a Chat Completions clássica não tem pesquisa nativa).
- **Structured Outputs** (JSON Schema, `strict: true`): é o schema que garante o formato — nomeadamente que `category` é obrigatoriamente uma das **11 categorias canónicas inglesas** de `COMPONENT_CATEGORIES`. Nunca deixar texto livre da IA chegar a `components.category`.
- O campo `source.url` vem das **citações** devolvidas pelo `web_search`, não do texto do modelo (evita URLs inventados).
- Validação **Zod** na app como segunda linha antes de qualquer preview ou escrita.
- `OPENAI_API_KEY` só no servidor (Vercel), chamadas a partir de server actions.

Resposta esperada:

```json
{
  "bike": { "brand": "YT", "model": "Decoy", "version": "Core 4", "year": 2024, "category": "eMTB" },
  "source": { "url": "https://...", "confidence": 0.98 },
  "components": [
    { "category": "Front Suspension (Fork)", "brand": "FOX", "model": "38 Factory", "variant": "Grip X2", "year": 2024 },
    { "category": "Rear Suspension", "brand": "FOX", "model": "Float X2 Factory" },
    { "category": "Electric", "brand": "Shimano", "model": "EP8" },
    { "category": "Brakes", "brand": "SRAM", "model": "Code RSC" }
  ]
}
```

- **`variant` não existe no modelo de dados**: na criação do componente concatena-se ao `model` para apresentação ("38 Factory Grip X2"), mas o lookup no Maintenance Catalog usa o modelo **sem variante** — senão "38 Factory" e "38 Factory Grip X2" seriam componentes diferentes para efeitos de manutenção.
- **eMTB (decisão):** motor e bateria **entram na v1** como componentes de categoria `Electric`, com os intervalos que a documentação der (inspeção do motor, verificação da bateria). 

### 4. Intervalos: Maintenance Catalog, com IA como fallback

Para cada componente extraído:

1. Lookup no Maintenance Catalog pela chave normalizada — **para todas as categorias** (é grátis).
2. Miss → IA pesquisa a documentação oficial, **mas só para as categorias onde os fabricantes publicam planos de manutenção** (`AI_MAINTENANCE_SEARCH_CATEGORIES`, 2026-08-09): suspensão, amortecedor, espigão, quadro e elétrico. Medido no primeiro teste real: pneus, selins, cockpits e travões devolveram sempre "sem documentação" e custavam o mesmo — mais de metade do gasto comprava respostas vazias; o filtro corta o pior caso de ~0,73 $ para ~0,35 $ por bicicleta nova. A app **guarda o perfil completo** (`km` / `hours` / `months`), e um `not_found` guarda um **perfil vazio** (cache negativo) para nunca se repetir a pesquisa.
3. Componente fora das categorias elegíveis ou sem perfil → cria-se na mesma, **sem intervalos**; o utilizador adiciona depois. Resultado parcial é sucesso parcial, não erro.

**Categoria Seatpost (2026-08-09):** os espigões caíam em "Other", indistinguíveis de selins para efeitos do filtro. `Seatpost` passou a categoria própria (lista, ícone — por agora o de "Other" —, traduções "Espigão"/"Seatpost", e instrução no prompt da IA).

**Perfis por defeito em código (2026-08-09):** para categorias onde o plano sensato é regra de bolso e não documento do fabricante, `default-profiles.ts` define lembretes fixos — sem lookup, sem IA, sempre aplicados e pré-selecionados no preview (desmarcar é o opt-out). A cadência vem do tipo da bicicleta, que a IA nunca saberia pelo nome da peça:

| Categoria | Lembretes | Cadência |
|---|---|---|
| **Rodas** | Verificação e reaperto de raios | 3 meses (Enduro/DH/E-MTB), 12 meses (resto) |
| **Travões** | Sangria · Limpeza/lubrificação dos pistões · Revisão completa da pinça | tabela por modalidade: Estrada 12/12/36, XC e Gravel 12/12/24, Enduro 6/6/24, E-MTB 6/6/18, DH 3/3/12 (meses); Endurance road e Urban seguem Estrada, Other segue Gravel |
| **Transmissão** | Limpeza da transmissão · Lubrificação da corrente | igual em todas as modalidades: limpeza a cada mês; lubrificação a cada 3 h (aproximação de "a cada saída" — o motor de intervalos não conta saídas) |

**Decisão — limite de 3 slots:** o esquema atual tem 3 slots de lembrete por componente e **não muda**. O perfil guarda tudo; ao criar o componente **a app escolhe os 3 mais relevantes** (heurística: os de menor intervalo/uso mais frequente primeiro), e o preview mostra os restantes para o utilizador trocar se quiser.

**Decisão — língua:** os nomes de intervalos guardam-se em **inglês canónico** no catálogo ("Lower Leg Service") e traduzem-se na apresentação, seguindo o padrão das categorias. Como os nomes de intervalos são texto livre, o mecanismo é um mapa de tradução `intervalName(dict, name)` com fallback para a própria string — um nome sem tradução mostra-se em inglês, nunca em branco.

### 5. Preview — mostra-se SEMPRE

O preview é apresentado **sempre**, independentemente da confiança. A confiança decide outra coisa (ver "Confiança e curadoria").

> 🎉 Encontrámos a tua bicicleta
> **YT Decoy Core 4 (2024)**
> ✓ 14 componentes encontrados
> ✓ 22 intervalos de manutenção configurados
> Fonte: YT Industries
> [Rever componentes] [Criar bicicleta]

- O utilizador pode editar qualquer componente antes de criar.
- **Edições do utilizador aplicam-se só à bicicleta dele, nunca ao catálogo.** Não há como distinguir uma correção ("a ficha está errada") de uma personalização ("a minha tem outra suspensão"), e uma personalização não pode contaminar a configuração de todos.
- **Baseline dos componentes:** o preview pergunta se os componentes são os de origem. Se sim (default), nascem com `bike_km_at_install = 0` — herdam todo o uso da bicicleta, que é a realidade de uma bicicleta usada com 2000 km. Criá-los "a zeros" daria lembretes todos errados.
- Detalhe técnico: uma bicicleta criada já com totais preenchidos fica com `usage_updated_at = null` (o trigger só dispara em update) — o fluxo de criação deve contar com isso.

### 6. Criação

A app (server action) cria bicicleta + componentes + intervalos numa sequência única. A IA nunca toca na base de dados.

## Confiança e curadoria do catálogo

A confiança auto-reportada de um LLM **não é calibrada** — 0.98 não é uma probabilidade. Usa-se como triagem, nunca como gate único:

- **Confiança ≥ limiar (ex.: 0.95):** a entrada grava-se no catálogo como `unverified`.
- **Abaixo do limiar:** grava-se como `low_confidence` — serve o próprio utilizador mas pode ser revista antes de servir os seguintes (decisão de curadoria fina fica para depois da v1; no mínimo, o estado fica registado).
- O catálogo guarda **o que a IA encontrou na fonte**, não o que o utilizador editou.
- Upsert sobre índice único na chave normalizada — resolve a corrida de dois utilizadores a pesquisar a mesma bicicleta em simultâneo.

## Quota e custo

**Decisão:** **3 pesquisas IA por dia por utilizador, igual no Personal e no Pro.** Lookups ao catálogo não contam. Uma bicicleta nova fora do catálogo custa ~1 + N chamadas (N = componentes sem perfil).

Tabela de log de pedidos IA (`ai_request_log`): utilizador, tipo (bike/component), input, tokens/custo, resultado, timestamp. É o que mede a quota e o que prova (ou desmente) que o catálogo está a reduzir custos.

## Falhas

- **Ficha não encontrada:** mensagem honesta + caminho direto para a criação manual. A tentativa falhada não conta para a quota se não houve resposta útil (a decidir na implementação; registar sempre no log).
- **Resposta inválida (schema/Zod):** trata-se como não encontrada; nunca mostrar dados meio-validados.
- **Perfil de manutenção em falta:** componente cria-se sem intervalos (ver acima).

## Gate de plano — e beta fechada (2026-08-09)

`PLAN_FEATURES` (`src/lib/plans.ts`) ganha `aiSetup: boolean` — `false` no Free, `true` no Personal e Pro. Aplicado **no servidor** na server action, refletido na UI, seguindo o padrão do `timeline`.

**Por cima do gate de plano há uma beta fechada:** `AI_SETUP_BETA_EMAILS` (`src/lib/ai-setup-access.ts`) lista quem tem acesso — por agora só `miguelgomesdzn@gmail.com`. `hasAiSetupAccess(plan, email)` compõe os dois gates e é o único ponto de decisão (ações, página e banner de entrada). Enquanto a beta durar, quem está de fora vê o aviso de beta (não o pitch Premium, que prometeria o que um upgrade não dá); o banner na página de nova bicicleta só aparece a quem está na lista. Alargar a beta é acrescentar emails à lista; terminá-la é remover a lista e o check.

## Esquema (novas tabelas)

```sql
-- Catálogo partilhado de bicicletas
create table bike_catalog (
  id uuid primary key default gen_random_uuid(),
  brand text not null,          -- normalizado (lowercase, trim, sem acentos)
  model text not null,
  version text not null default '',
  year int not null,
  display jsonb not null,       -- strings originais para apresentação
  components jsonb not null,    -- lista de componentes (formato da resposta IA, validado)
  source_url text,
  confidence numeric,
  status text not null default 'unverified'
    check (status in ('unverified', 'low_confidence', 'verified')),
  created_at timestamptz not null default now(),
  unique (brand, model, version, year)
);

-- Catálogo partilhado de perfis de manutenção
create table maintenance_profiles (
  id uuid primary key default gen_random_uuid(),
  brand text not null,          -- normalizado, sem variante
  model text not null,
  year int,                     -- null = qualquer ano
  intervals jsonb not null,     -- TODOS os intervalos; nomes em inglês canónico
  source_url text,
  confidence numeric,
  status text not null default 'unverified'
    check (status in ('unverified', 'low_confidence', 'verified')),
  created_at timestamptz not null default now(),
  unique (brand, model, year)
);

-- Log de pedidos IA (quota + observabilidade de custo)
create table ai_request_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('bike', 'component')),
  input jsonb not null,
  outcome text not null check (outcome in ('found', 'not_found', 'invalid', 'error')),
  tokens int,
  created_at timestamptz not null default now()
);
```

JSONB e não tabelas filhas normalizadas: o conteúdo lê-se de uma vez e escreve-se de uma vez, sem queries relacionais. Os catálogos são partilhados — sem RLS por utilizador, escrita apenas por server actions. O `ai_request_log` tem RLS normal por utilizador.

## Benefícios (inalterados)

Onboarding quase automático; catálogo próprio como ativo exclusivo e vantagem competitiva; custo de IA decrescente; consistência — o mesmo componente tem os mesmos intervalos para todos os utilizadores.
