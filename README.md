# SIGHC — Backend

API REST do Sistema Integrado de Gestão de Horas Complementares, construída com **Express** rodando sobre **Firebase Cloud Functions**.

---

## Instalação

### Pré-requisitos

- [Node.js 24+](https://nodejs.org/)
- [Firebase CLI](https://firebase.google.com/docs/cli) instalado globalmente

```bash
npm install -g firebase-tools
```

### Passos

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/SIGHC.git
cd SIGHC/backend/functions

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env
# Edite o .env com as suas credenciais

# 4. Faça login no Firebase
firebase login

# 5. Inicie o emulador local
npm run serve
```

A API ficará disponível em `http://127.0.0.1:5001/<projeto>/us-central1/api`.

---

## Tecnologias

| Tecnologia | Uso |
|---|---|
| Node.js 24 + ES Modules | Runtime |
| Firebase Cloud Functions | Hospedagem serverless |
| Firebase Admin SDK | Firestore, Auth, Cloud Storage |
| Express | Roteamento HTTP |
| Google Cloud Vision | OCR em PDFs |
| Google Gemini 2.5 Flash | Análise de certificados com IA |
| Nodemailer + Gmail SMTP | Envio de e-mails |
| ESLint (config Google) | Linting |

---

## Estrutura de pastas

```
functions/
├── index.js              # Entry point — registra a Cloud Function e monta o app Express
├── config/
│   ├── firebase.js       # Inicialização do Firebase Admin SDK
│   └── nodemailer.js     # Configuração do transporte de e-mail
├── routes/               # Definição das rotas por domínio
├── controllers/          # Lógica de negócio de cada rota
├── middlewares/
│   └── authMiddleware.js # Autenticação e RBAC
├── models/               # Operações de leitura/escrita no Firestore
└── services/
    └── pdfScanner.js     # Validação e análise de segurança de PDFs
```

---

## Variáveis de ambiente

Crie um arquivo `.env` em `functions/` com as seguintes variáveis:

```env
GOOGLE_SERVICE_ACCOUNT_B64=  # Service Account JSON codificado em Base64
APP_STORAGE_BUCKET=           # URL do bucket do Cloud Storage (ex: projeto.appspot.com)
USER_GMAIL=                   # E-mail Gmail usado para envio de notificações
PASSWORD_GMAIL=               # App Password do Gmail
GEMINI_API_KEY=               # Chave da API do Google Gemini
```

---

## Autenticação e autorização

Toda autenticação é feita via **Firebase ID Token** enviado no header:

```
Authorization: Bearer <token>
```

O middleware valida o token e extrai a role do usuário a partir dos Custom Claims do Firebase. As roles disponíveis são:

| Role | Descrição |
|---|---|
| `aluno` | Estudante — acessa apenas os próprios dados |
| `coordenador` | Coordenador — visualiza alunos e turmas |
| `admin` | Administrador — gerencia certificados e notificações |
| `superAdmin` | Super Administrador — acesso total |

---

## Endpoints

### Auth — `/auth`

| Método | Rota | Descrição | Acesso |
|---|---|---|---|
| POST | `/auth/login/aluno` | Login do aluno | Público |
| POST | `/auth/login/admin` | Login do admin | Público |
| POST | `/auth/login/super-admin` | Login do super admin | Público |

### Alunos — `/alunos`

| Método | Rota | Descrição | Acesso |
|---|---|---|---|
| GET | `/alunos` | Lista alunos | coordenador+ |
| POST | `/alunos` | Cria aluno | superAdmin |
| PUT | `/alunos/:id` | Atualiza aluno | superAdmin |
| DELETE | `/alunos/:id` | Remove aluno | superAdmin |

### Cursos — `/cursos`

| Método | Rota | Descrição | Acesso |
|---|---|---|---|
| GET | `/cursos` | Lista cursos | superAdmin |
| GET | `/cursos/:id` | Detalhe do curso | superAdmin |
| POST | `/cursos` | Cria curso | superAdmin |
| PUT | `/cursos/:id` | Atualiza curso | superAdmin |
| DELETE | `/cursos/:id` | Remove curso | superAdmin |

### Turmas — `/turmas`

| Método | Rota | Descrição | Acesso |
|---|---|---|---|
| GET | `/turmas` | Lista turmas | coordenador+ |
| GET | `/turmas/:id` | Detalhe da turma | coordenador+ |
| POST | `/turmas` | Cria turma | superAdmin |
| PUT | `/turmas/:id` | Atualiza turma | superAdmin |
| DELETE | `/turmas/:id` | Remove turma | superAdmin |

### Certificados — `/certificados`

| Método | Rota | Descrição | Acesso |
|---|---|---|---|
| GET | `/certificados` | Lista certificados do aluno autenticado | aluno |
| POST | `/certificados/processar` | Valida e registra um certificado enviado | Público |
| POST | `/certificados/ocr` | Extrai texto de um PDF via Google Vision | Público |
| POST | `/certificados/analisar-ia` | Classifica certificado com Gemini | Público |

### Notificações — `/notificacoes`

| Método | Rota | Descrição | Acesso |
|---|---|---|---|
| POST | `/notificacoes/upload-certificado` | Notifica admins sobre novo upload | Público |
| POST | `/notificacoes/certificado-analisado` | Notifica aluno sobre análise concluída | admin+ |

### Admins — `/admins`

| Método | Rota | Descrição | Acesso |
|---|---|---|---|
| GET | `/admins` | Lista administradores | superAdmin |
| POST | `/admins` | Cria administrador | superAdmin |
| PUT | `/admins/:id` | Atualiza administrador | superAdmin |
| DELETE | `/admins/:id` | Remove administrador | superAdmin |

### Chat — `/chat`

| Método | Rota | Descrição | Acesso |
|---|---|---|---|
| POST | `/chat/mensagem` | Envia mensagem para o agente de IA | Autenticado |

---

## Scripts

```bash
npm run serve       # Inicia o emulador local do Firebase
npm run deploy      # Faz deploy para o Firebase
npm run lint        # Executa o ESLint
npm run logs        # Exibe logs da Cloud Function em produção
npm run add         # Cria um usuário admin via script
```

---

## Fluxo de processamento de certificados

1. O app mobile faz upload do PDF para `certificados_temp/` no Cloud Storage
2. Chama `POST /certificados/ocr` — extrai o texto via Google Cloud Vision
3. Chama `POST /certificados/analisar-ia` — classifica o certificado com Gemini
4. Chama `POST /certificados/processar` — o backend valida tamanho, magic bytes e estrutura do PDF; se aprovado, move para `certificados/` e cria o documento no Firestore com status `pendente`
5. Um admin revisa e atualiza o status para `aprovado` ou `rejeitado`
