<a href="https://docs.databricks.com/aws/en/generative-ai/agent-framework/chat-app">
  <h1 align="center">Databricks Supervisor Chat Template</h1>
</a>

<p align="center">
    A chat application template for interacting with a Databricks Multi-Agent Supervisor endpoint, built with ExpressJS, React, Vercel AI SDK, Databricks authentication, and Lakebase-backed chat history.
</p>

<p align="center">
  <a href="#features"><strong>Features</strong></a> ·
  <a href="#running-locally"><strong>Running Locally</strong></a> ·
  <a href="#deployment"><strong>Deployment</strong></a> ·
  <a href="#optional-chat-ui-features"><strong>Optional Features</strong></a>
</p>
<br/>

This template provides a fully functional supervisor chat app for Agent Bricks and custom agents deployed on Databricks.
It is opinionated toward one custom chat UI that talks to a single Multi-Agent Supervisor endpoint, while preserving Databricks-native citations, tool parts, and OBO behavior.

## Features

- **Databricks Multi-Agent Supervisor Integration**: Direct connection to a Databricks supervisor endpoint that can orchestrate Agent Bricks and custom agents
- **Databricks Authentication**: Uses Databricks authentication to identify end users of the chat app and securely manage their conversations.
- **Persistent Chat History**: Leverages Databricks Lakebase (Postgres) for storing conversations, with governance and tight lakehouse integration. The template ships with database resources enabled by default.
- **User Feedback Collection (Optional)**: Thumbs up/down feedback on assistant messages, stored as MLflow assessments on the underlying traces. Requires an MLflow experiment resource to be configured.

## Prerequisites

1. **Databricks Multi-Agent Supervisor endpoint**: you need access to a Databricks workspace containing the supervisor serving endpoint you want the app to chat with.
2. **Underlying Knowledge Assistant endpoint**: you also need the serving endpoint name for the Knowledge Assistant the supervisor orchestrates, so the app service principal can be granted `CAN_QUERY`.
3. **Azure Databricks workspace URL**: for CLI authentication on Azure, you should know your workspace host, for example `https://adb-<workspace-id>.<region>.azuredatabricks.net`.
4. **Set up Databricks authentication**
   - Install the latest version of the [Databricks CLI](https://docs.databricks.com/en/dev-tools/cli/install.html). On macOS, do this via:
   ```bash
   brew install databricks
   brew upgrade databricks && databricks -v
   ```
   - Run the following to configure authentication.
     In the snippet below, `DATABRICKS_CONFIG_PROFILE` is the name of the Databricks CLI profile under which to configure
     authentication. If desired, you can update this to a name of your choice, e.g. `dev_workspace`.
   ```bash
     export DATABRICKS_CONFIG_PROFILE='chatbot_template'
     databricks auth login --host https://adb-<workspace-id>.<region>.azuredatabricks.net --profile "$DATABRICKS_CONFIG_PROFILE"
   ```

## Deployment

This project includes a [Databricks Asset Bundle (DAB)](https://docs.databricks.com/aws/en/dev-tools/bundles/apps-tutorial) configuration that simplifies deployment by automatically creating and managing all required resources.

1. **Clone the repo**:
   ```bash
   git clone https://github.com/databricks/app-templates
   cd e2e-chatbot-app-next
   ```
2. **Databricks authentication**: Ensure auth is configured as described in [Prerequisites](#prerequisites).
3. **Set the endpoint names in `databricks.yml`**:
   - Update `serving_endpoint_name` to the name of the Multi-Agent Supervisor endpoint to chat with.
   - Update `knowledge_assistant_endpoint_name` to the underlying Knowledge Assistant serving endpoint name.
   - **Persistent chat history** is already enabled in the template via the bundled Lakebase database resource and binding.
   - **User feedback collection** remains optional: uncomment the experiment block only if you want MLflow thumbs up/down feedback later.

   - NOTE: if using [Agent Bricks Multi-Agent Supervisor](https://docs.databricks.com/aws/en/generative-ai/agent-bricks/multi-agent-supervisor), you need to additionally grant the app service principal the `CAN_QUERY` permission on the underlying agent(s) that the MAS orchestrates. You can do this by adding those
     agent serving endpoints as resources in `databricks.yml`. This template already wires the Knowledge Assistant endpoint and includes a commented example block for additional Genie or other agents.
4. **Validate the bundle configuration**:

   ```bash
   databricks bundle validate
   ```

5. **Deploy the bundle**. The first deployment may take several minutes because it provisions the app and Lakebase database resources:

   ```bash
   databricks bundle deploy
   ```

   This creates:

   - **App resource** ready to start
   - **Lakebase database instance** for persistent supervisor chat history

6. **Start the app**:

   ```bash
   databricks bundle run databricks_supervisor_chat
   ```

7. **View deployment summary** (useful for debugging deployment issues):
   ```bash
   databricks bundle summary
   ```

### Deployment Targets

The bundle supports multiple environments:

- **dev** (default): Development environment
- **staging**: Staging environment for testing
- **prod**: Production environment

To deploy to a specific target:

```bash
databricks bundle deploy -t staging --var serving_endpoint_name="your-endpoint"
```

## Running Locally

### Quick Start (Recommended)

Use our automated quickstart script for the fastest setup experience:

1. **Clone the repository**:

   ```bash
   git clone https://github.com/databricks/app-templates
   cd e2e-chatbot-app-next
   ```

2. **Run the quickstart script**:

   ```bash
   ./scripts/quickstart.sh
   ```

   The quickstart script will:
   - **Install prerequisites** - Automatically installs jq, nvm, Node.js 20, and Databricks CLI
   - **Configure authentication** - Helps you select or create a Databricks CLI profile
   - **Set up serving endpoints** - Prompts for your Multi-Agent Supervisor endpoint name and the underlying Knowledge Assistant endpoint name, then validates both
   - **Database setup** - Keeps persistent chat history enabled by default, with an option to fall back to ephemeral mode
   - **Deploy to Databricks (optional)** - Optionally deploys resources and provisions database
   - **Configure local environment** - Automatically creates and populates .env
   - **Run migrations** - Sets up database schema if database is enabled

   The script handles the entire setup process automatically, including waiting for database provisioning and configuring connection details.

3. **Start the application**:

   Use the convenience script:
   ```bash
   ./scripts/start-app.sh
   ```

   Or manually:
   ```bash
   npm install  # Install/update dependencies
   npm run dev  # Start development server
   ```

   The app starts on [localhost:3000](http://localhost:3000) (frontend) and [localhost:3001](http://localhost:3001) (backend)

   **Tip:** The `start-app.sh` script is useful for quickly starting the app after initial setup, as it ensures dependencies are up-to-date before starting the dev server.

### Manual Setup (Alternative)

If you prefer to configure the environment manually:

1. **Clone and install**:

   ```bash
   git clone https://github.com/databricks/app-templates
   cd e2e-chatbot-app-next
   npm install
   ```

2. **Set up environment variables**:

   ```bash
   cp .env.example .env
   ```

   Address the TODOs in `.env`, specifying your Databricks CLI profile and database connection details.
   - `DATABRICKS_SERVING_ENDPOINT` should always be the supervisor endpoint name.
   - The Knowledge Assistant endpoint is only needed in `databricks.yml` for deployed app permissions.

3. **Run the application**:

   ```bash
   npm run dev
   ```

   The app starts on [localhost:3000](http://localhost:3000)

### Optional Chat UI Features

The chat UI supports persistent history by default and one optional feature that can be enabled later:

### User Feedback

Users can give thumbs up/down on assistant responses. Feedback is stored as [MLflow assessments](https://docs.databricks.com/aws/en/generative-ai/agent-evaluation/assessments) on the underlying traces, making it easy to review and act on in the MLflow Experiment Tracking UI.

Feedback is **disabled by default**. See [Feedback Collection](#feedback-collection) for setup instructions.

> **Note:** If you're using one of the conversational agent templates (e.g. `agent-openai-agents-sdk`, `agent-langgraph`), their `databricks.yml` already creates and binds an MLflow experiment — feedback works automatically after `databricks bundle deploy`, with no extra configuration required.

### Persistent Chat History

The template binds a Lakebase database in `databricks.yml` by default so conversation history persists across sessions. You can still switch to ephemeral mode by removing database configuration locally or commenting out the database resources before deployment.

See [Database Modes](#database-modes) for setup instructions.

---

## Database Modes

The application supports two operating modes:

#### Persistent Mode (with Database)

This is the default mode when database environment variables are configured. In this mode:

- Chat conversations are saved to Postgres/Lakebase
- Users can access their chat history via the sidebar
- Conversations persist across sessions
- A database connection is required (POSTGRES_URL or PGDATABASE env vars)

#### Ephemeral Mode (without Database)

The application can also run without a database. In this mode:

- Chat conversations work normally but are **not saved**
- The sidebar shows "No chat history available"
- A small "Ephemeral" indicator appears in the header
- Users can still have conversations with the AI, but history is lost on page refresh

#### Selecting a Database Mode

The application falls back to "Ephemeral mode" when no database environment variables are set.
To run in the default persistent mode locally, ensure your environment contains the following database variables:

```bash
# Useful for local development
POSTGRES_URL=...

# OR

# Handled for you when using Databricks Apps
PGUSER=...
PGPASSWORD=...
PGDATABASE=...
PGHOST=...
```

The app will detect the absence or precense of database configuration and automatically run in the correct mode.

#### Enabling Database After Installation

If you switch the template to ephemeral mode and want to restore persistent chat history later, you can re-run the quickstart script:

```bash
./scripts/quickstart.sh
```

When prompted about enabling persistent chat history, select "Yes". The script will:
- Uncomment the required database sections in `databricks.yml`
- Optionally deploy the Lakebase database instance
- Configure your `.env` file with database connection details
- Run database migrations if the database is provisioned
- Set up your local environment with the correct database settings

The script handles all configuration automatically, including:
- Detecting your Databricks workspace and authentication
- Calculating the correct database instance name for your target environment
- Retrieving the database host (PGHOST) after provisioning
- Updating environment variables with the correct values

**Manual Steps (Alternative):**

If you prefer to enable the database manually:

1. **Edit `databricks.yml`** - Ensure both database sections are enabled:
   - Database instance resource (`supervisor_chat_lakebase`)
   - Database resource binding (`- name: database`)

2. **Deploy the database**:
   ```bash
   databricks bundle deploy
   ```
   (First deployment takes several minutes for provisioning)

3. **Configure `.env`** with database variables:
   ```bash
   PGUSER=your-databricks-username
   PGHOST=your-postgres-host  # Get with: ./scripts/get-pghost.sh
   PGDATABASE=databricks_postgres
   PGPORT=5432
   ```

4. **Run database migrations**:
   ```bash
   npm run db:migrate
   ```

## Feedback Collection

The chat app supports optional thumbs up/down feedback on assistant messages. When enabled, feedback is stored as [MLflow assessments](https://docs.databricks.com/aws/en/generative-ai/agent-framework/chat-app) on the traces emitted by your agent endpoint, making it easy to review and act on in the MLflow UI.

Feedback is **disabled by default** and the UI stays focused on the supervisor chat experience until you explicitly enable it.

> **Note:** Feedback vote persistence (restoring thumbs up/down state on page reload) requires a database. Both features can be enabled together in one step using the quickstart script.

### Recommended: use the quickstart script

The easiest way to enable feedback (and persistent chat history) is to run the interactive setup script:

```bash
./scripts/quickstart.sh
```

The script automatically:
1. Looks up the MLflow experiment ID linked to your serving endpoint
2. Uncomments and configures the feedback `TODO` block in `databricks.yml` (setting `experiment_id`) and the `MLFLOW_EXPERIMENT_ID` env var in `app.yaml`
3. Reuses the existing database configuration in `databricks.yml` for vote persistence

After the script completes, run `databricks bundle deploy` to apply the changes.

### Manual setup

If you prefer to configure manually:

**Step 1 — Find your experiment ID**

```bash
# For a custom-code agent or Agent Bricks serving endpoint
npx tsx scripts/get-experiment-id.ts --endpoint <your-endpoint-name>

# For an Agent Bricks Knowledge Assistant or Multi-Agent Supervisor
npx tsx scripts/get-experiment-id.ts --agent-brick <agent-brick-name>
```

**Step 2 — Configure `databricks.yml`**

Uncomment both database `TODO` blocks (required for vote persistence) and the feedback `TODO` block, setting the experiment ID from Step 1:

```yaml
- name: experiment
  description: "MLflow experiment for collecting user feedback"
  experiment:
    experiment_id: "your-experiment-id"
    permission: CAN_EDIT
```

**Step 3 — Configure `app.yaml`**

Uncomment the `MLFLOW_EXPERIMENT_ID` environment variable:

```yaml
- name: MLFLOW_EXPERIMENT_ID
  valueFrom: experiment
```

**Step 4 — Redeploy**:

```bash
databricks bundle deploy
databricks bundle run databricks_supervisor_chat
```

Once deployed, the thumbs up/down buttons become active on assistant messages.

### Enabling feedback for local development

Set `MLFLOW_EXPERIMENT_ID` in your `.env` file to the experiment ID from Step 1:

```bash
MLFLOW_EXPERIMENT_ID=<your-experiment-id>
```

## Testing

The project uses Playwright for end-to-end testing and supports dual-mode testing to verify behavior in both persistent and ephemeral modes.

### Test Modes

Tests run in two separate modes to ensure both database and non-database functionality work correctly:

#### With Database Mode

- Uses database environment variables (either set in .env or declared elsewhere)
- Includes full Postgres database
- Tests chat history persistence, pagination, and deletion
- Will throw a warning and stop if no database exists

#### Ephemeral Mode

- No database connection (all POSTGRES_URL and PG\* variables omitted)
- Tests chat streaming without persistence
- Ensures UI gracefully handles missing database

### Running Tests

**Run all tests (both modes sequentially)**:

```bash
npm test
```

This runs with-db tests first, then ephemeral tests. The server automatically restarts between modes with different configurations.

**Run specific mode**:

```bash
# Test with database only
npm run test:with-db

# Test ephemeral mode only
npm run test:ephemeral
```

### Continuous Integration

The GitHub Actions workflow runs both test modes in separate jobs:

- **test-with-db**: Includes Postgres service, runs migrations, executes with-db tests
- **test-ephemeral**: No Postgres, no migrations, executes ephemeral tests

Both jobs run in parallel for faster CI feedback.

## Known limitations

- No support for image or other multi-modal inputs
- The most common and officially recommended authentication methods for Databricks are supported: Databricks CLI auth for local development, and Databricks service principal auth for deployed apps. Other authentication mechanisms (PAT, Azure MSI, etc) are not currently supported.
- We create one database per app, because the app code targets a fixed `ai_chatbot` schema within the database instance. To host multiple apps out of the same instance, you can:
  - Update the database instance name in `databricks.yml`
  - Update references to `ai_chatbot` in the codebase to your new desired schema name within the existing database instance
  - Run `npm run db:generate` to regenerate database migrations
  - Deploy your app

## Troubleshooting

### "reference does not exist" errors when running databricks bundle CLI commands

If you get an error like the following (or other similar "reference does not exist" errors)
while running `databricks bundle` commands, your Databricks CLI version may be out of date.
Make sure to install the latest version of the Databricks CLI (per [Prerequisites](#prerequisites)) and try again.

```bash
$ databricks bundle deploy
Error: reference does not exist: ${workspace.current_user.domain_friendly_name}

Name: databricks_supervisor_chat
Target: dev
Workspace:
  User: user@company.com
  Path: /Workspace/Users/user@company.com/.bundle/databricks_supervisor_chat/dev
```

### "Resource not found" errors during databricks bundle deploy

Errors like the following one can occur when attempting to deploy the app if the state of your bundle does not match the state of resources
deployed in your workspace:

```bash
$ databricks bundle deploy
Uploading bundle files to /Workspace/Users/user@company.com/.bundle/databricks_supervisor_chat/dev/files...
Deploying resources...
Error: terraform apply: exit status 1

Error: failed to update database_instance

  with databricks_database_instance.supervisor_chat_lakebase,
  on bundle.tf.json line 45, in resource.databricks_database_instance.supervisor_chat_lakebase:
  45:       }

Resource not found


Updating deployment state...
```

This can happen if resources deployed via your bundle were then manually deleted, or resources specified by your bundle
were manually created without using the `databricks bundle` CLI. To resolve this class of issue, inspect the state of the actual deployed resources
in your workspace and compare it to the bundle state using `databricks bundle summary`. If there is a mismatch,
[see docs](https://docs.databricks.com/aws/en/dev-tools/bundles/faqs#can-i-port-existing-jobs-pipelines-dashboards-and-other-databricks-objects-into-my-bundle) on how to
manually bind (if resources were manually created) or unbind (if resources were manually deleted) resources
from your current bundle state. In the above example, the `supervisor_chat_lakebase` database instance resource
was deployed via `databricks bundle deploy`, and then manually deleted. This broke subsequent deployments of the bundle
(because bundle state indicated the resource should exist, but it did not in the workspace). Running `databricks bundle unbind supervisor_chat_lakebase` updated bundle state to reflect the deletion of the instance,
unblocking subsequent deployment of the bundle via `databricks bundle deploy`.
