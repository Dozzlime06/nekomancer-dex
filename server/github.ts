import { Octokit } from '@octokit/rest'

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

export async function getUncachableGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

export async function pushToGitHub(owner: string, repo: string, branch: string = 'main') {
  const octokit = await getUncachableGitHubClient();
  
  // Get latest commit SHA
  const { data: ref } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`
  });
  const latestCommitSha = ref.object.sha;

  // Get the tree of the latest commit
  const { data: commit } = await octokit.git.getCommit({
    owner,
    repo,
    commit_sha: latestCommitSha
  });

  return {
    latestCommitSha,
    treeSha: commit.tree.sha,
    octokit
  };
}

export async function deployToVercel(owner: string, repo: string, message: string = 'Deploy from Replit') {
  const octokit = await getUncachableGitHubClient();
  const branch = 'main';

  try {
    // Create a deployment using GitHub's deployment API
    // This triggers Vercel if it's connected to the repo
    const { data: deployment } = await octokit.repos.createDeployment({
      owner,
      repo,
      ref: branch,
      environment: 'production',
      auto_merge: false,
      required_contexts: [],
      description: message
    });

    console.log('Deployment created:', deployment);

    // Update deployment status
    if (typeof deployment === 'object' && 'id' in deployment) {
      await octokit.repos.createDeploymentStatus({
        owner,
        repo,
        deployment_id: deployment.id,
        state: 'pending',
        description: 'Deploying to Vercel...'
      });
    }

    return deployment;
  } catch (error) {
    console.error('Deployment error:', error);
    throw error;
  }
}
