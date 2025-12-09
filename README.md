# Connection Tester App

A Next.js application for testing database and API connections within a Kubernetes cluster.

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

---

## Kubernetes Deployment Guide

This guide covers deploying the app to a Kubernetes cluster using the Kubernetes Dashboard (portal UI).

### Prerequisites

- Access to a Docker registry (Docker Hub, private registry, GCR, ECR, etc.)
- Access to the Kubernetes Dashboard/Portal
- Docker installed locally for building the image

### Step 1: Build and Push Docker Image

#### Option A: Docker Hub (Public)

```bash
# Build the Docker image
docker build -t yourusername/connection-tester:latest .

# Login to Docker Hub
docker login

# Push to Docker Hub
docker push yourusername/connection-tester:latest
```

#### Option B: Private Registry

```bash
# Build the image
docker build -t registry.example.com/connection-tester:latest .

# Login to your registry
docker login registry.example.com

# Push to registry
docker push registry.example.com/connection-tester:latest
```

#### Option C: Google Container Registry (GCR)

```bash
# Build and tag
docker build -t gcr.io/YOUR_PROJECT_ID/connection-tester:latest .

# Push to GCR
docker push gcr.io/YOUR_PROJECT_ID/connection-tester:latest
```

### Step 2: Update Kubernetes Manifests

Edit `k8s/deployment.yaml` or `k8s/all-in-one.yaml` and replace `YOUR_DOCKER_REGISTRY/connection-tester:latest` with your actual image path:

```yaml
image: yourusername/connection-tester:latest
```

### Step 3: Deploy via Kubernetes Dashboard

Since you're using the Kubernetes portal/dashboard without CLI access:

#### Method 1: Create from YAML (Recommended)

1. Open the Kubernetes Dashboard
2. Click the **"+"** button in the top-right corner (Create new resource)
3. Select **"Create from input"** or **"Create from file"**
4. Copy the contents of `k8s/all-in-one.yaml` (after updating the image path)
5. Paste into the YAML editor
6. Click **"Upload"** or **"Deploy"**

#### Method 2: Create Deployment via Form

1. In the Kubernetes Dashboard, go to **Workloads > Deployments**
2. Click **"+"** to create a new deployment
3. Fill in the form:
   - **App name**: `connection-tester-app`
   - **Container image**: `yourusername/connection-tester:latest`
   - **Number of pods**: `1`
   - **Service**: External, port `80`, target port `3000`
4. Click **Deploy**

#### Method 3: Create Resources Separately

**Create Deployment:**
1. Go to **Workloads > Deployments**
2. Click **"+"** and use YAML from `k8s/deployment.yaml`

**Create Service:**
1. Go to **Service > Services**
2. Click **"+"** and use YAML from `k8s/service.yaml`

### Step 4: Verify Deployment

1. Go to **Workloads > Deployments** in the dashboard
2. Look for `connection-tester-app` with a green status indicator
3. Check **Pods** to ensure the pod is running
4. Go to **Service > Services** to find the assigned NodePort

### Step 5: Access the Application

Once deployed, access the app via:
- **NodePort**: `http://<node-ip>:<nodeport>`
- Check the Service details in the dashboard for the assigned port

---

## Kubernetes Manifest Files

| File | Description |
|------|-------------|
| `k8s/deployment.yaml` | Deployment configuration only |
| `k8s/service.yaml` | Service configuration only |
| `k8s/all-in-one.yaml` | Combined deployment + service |

### Resource Configuration

Default resource limits:
- CPU: 100m request, 500m limit
- Memory: 128Mi request, 512Mi limit

Modify these in the deployment YAML based on your cluster capacity.

---

## Private Registry Authentication

If your registry requires authentication, create a Secret in Kubernetes:

1. In the dashboard, go to **Config and Storage > Secrets**
2. Create a new secret of type `kubernetes.io/dockerconfigjson`
3. Name it `registry-secret`
4. Add your registry credentials
5. Uncomment the `imagePullSecrets` section in the deployment YAML:

```yaml
imagePullSecrets:
  - name: registry-secret
```

---

## Troubleshooting

### Pod not starting
- Check pod logs in the dashboard: **Workloads > Pods > [pod-name] > Logs**
- Verify the image name is correct and accessible
- Check if imagePullSecrets is needed for private registries

### Service not accessible
- Verify the service is created: **Service > Services**
- Check the NodePort assignment
- Ensure firewall rules allow traffic to the NodePort

### Image pull errors
- Verify the image exists in your registry
- Check registry authentication
- Ensure the cluster can reach your registry

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Kubernetes Cluster                  │
│  ┌────────────────────────────────────────────────┐ │
│  │              Service (NodePort)                 │ │
│  │                   Port: 80                      │ │
│  └──────────────────────┬─────────────────────────┘ │
│                         │                           │
│  ┌──────────────────────▼─────────────────────────┐ │
│  │               Deployment                        │ │
│  │  ┌──────────────────────────────────────────┐  │ │
│  │  │              Pod                          │  │ │
│  │  │  ┌────────────────────────────────────┐  │  │ │
│  │  │  │     connection-tester container    │  │  │ │
│  │  │  │          Port: 3000                │  │  │ │
│  │  │  └────────────────────────────────────┘  │  │ │
│  │  └──────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```
