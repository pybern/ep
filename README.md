# Endpoint Connection Tester

A comprehensive tool for testing API endpoints and OpenAI-compatible APIs with support for both client-side and server-side request modes.

## Features

- **API Testing**: Test any HTTP endpoint with full control over method, headers, and body
- **OpenAI API Testing**: Test OpenAI-compatible APIs (OpenAI, Azure, local LLMs, MaaS endpoints)
- **Dual Mode**: Switch between client-side (browser) and server-side (proxied) requests
- **SSL Control**: Skip SSL certificate verification for internal/self-signed certs (server mode only)
- **Quick Presets**: Pre-configured test endpoints for rapid testing

---

## Test Cases

### 1. API Testing

#### Client-Side Mode

The request is made directly from the browser using the native `fetch` API.

| Test Case | Description | Validation |
|-----------|-------------|------------|
| **GET Request** | Fetch data from any URL | Status code, response body |
| **POST/PUT/PATCH/DELETE Request** | Send data with custom body | Status code, response body |
| **HEAD/OPTIONS Request** | Metadata-only requests | Status code, headers only |
| **Custom Headers** | Add arbitrary key-value headers | Headers sent correctly |
| **Request Timeout** | Configurable timeout (1000-60000ms) | AbortError on timeout |
| **JSON Response Parsing** | Auto-parse `application/json` | Parsed JSON in details |
| **Non-JSON Response** | Text responses truncated to 5000 chars | Raw text in details |
| **Network Errors** | DNS, connection failures | Error message captured |
| **CORS Errors** | Cross-origin restrictions | Browser CORS error surfaced |

**Limitations:**
- ❌ Cannot skip SSL certificate verification (browser enforces SSL)
- ❌ Subject to browser CORS policies

---

#### Server-Side Mode

The request is proxied through a Next.js API route (`/api/proxy`) using `undici` for advanced HTTP control.

| Test Case | Description | Validation |
|-----------|-------------|------------|
| **All HTTP Methods** | GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS | Status code, response body |
| **Custom Headers** | Pass arbitrary headers to target | Headers forwarded correctly |
| **Request Body** | JSON or text body for non-GET methods | Body sent correctly |
| **Skip SSL Verification** | For self-signed certificates | `undici` Agent with `rejectUnauthorized: false` |
| **Request Timeout** | Configurable timeout (default 10000ms) | 408 Timeout response |
| **JSON Response Parsing** | Auto-parse `application/json` | Parsed JSON in response |
| **Large Response Handling** | Responses truncated to 10000 chars | Truncated text |
| **URL Validation** | Invalid URL format detection | 400 Bad Request |
| **Network Errors** | Connection failures, DNS errors | 500 Internal Server Error |

**Advantages:**
- ✅ No CORS restrictions
- ✅ Can skip SSL verification for internal/self-signed certs

---

### 2. OpenAI API Testing

#### Client-Side Mode

The request is made directly from the browser to the OpenAI-compatible API endpoint.

| Test Case | Description | Validation |
|-----------|-------------|------------|
| **Chat Completion Request** | Send messages to `/v1/chat/completions` | Response text, usage stats |
| **Model Selection** | Test any model (GPT-4, Llama, Claude, etc.) | Model-specific response |
| **System Prompt** | Customize assistant behavior | Affects response content |
| **User Prompt** | Test message input | AI-generated response |
| **Temperature** | Control randomness (0-2) | Affects response variability |
| **Max Tokens** | Limit response length (1-4096) | Truncated at limit |
| **API Key Validation** | Required field check | Error if missing |
| **Base URL Validation** | Valid URL format required | Error if invalid |
| **HTTP Error Responses** | 400, 401, 403, 404, 500, etc. | Error message extracted |
| **Non-JSON Response** | Gateway/proxy error pages | Error with preview |
| **Network Errors** | Connection failures, timeouts | Error name + message |

**Limitations:**
- ❌ Cannot skip SSL certificate verification
- ❌ Subject to browser CORS (may fail for some providers)

---

#### Server-Side Mode

The request is proxied through a Next.js API route (`/api/openai`) with SSL control.

| Test Case | Description | Validation |
|-----------|-------------|------------|
| **Chat Completion Request** | Server-proxied request to API | Response text, usage stats |
| **Model Selection** | Any OpenAI-compatible model | Model name in response |
| **System + User Prompts** | Custom message array | AI response |
| **Temperature & Max Tokens** | Inference parameters | Affects response |
| **Skip SSL Verification** | For MaaS/internal endpoints | `undici` bypasses SSL check |
| **API Key Forwarding** | Bearer token authorization | Secure header forwarding |
| **Base URL Flexibility** | OpenAI, Azure, local LLMs, MaaS | URL + `/v1/chat/completions` |
| **Input Validation** | Missing baseUrl, apiKey, model | 400 Bad Request |
| **Non-JSON Response Handling** | Error pages from gateways | Error with preview text |
| **API Error Handling** | Provider-specific errors | Error message extracted |

**Advantages:**
- ✅ No CORS restrictions
- ✅ Can skip SSL verification for internal/dev endpoints
- ✅ Secure: API keys never exposed to browser network tab

---

## Quick Test Presets (API Testing)

Pre-configured endpoints for rapid testing:

| Preset | URL | Method | Purpose |
|--------|-----|--------|---------|
| JSONPlaceholder - Posts | `https://jsonplaceholder.typicode.com/posts/1` | GET | Fetch single post |
| JSONPlaceholder - Users | `https://jsonplaceholder.typicode.com/users` | GET | List users |
| JSONPlaceholder - Create Post | `https://jsonplaceholder.typicode.com/posts` | POST | Create resource |
| HTTPBin - GET | `https://httpbin.org/get` | GET | Echo request data |
| HTTPBin - POST | `https://httpbin.org/post` | POST | Echo POST data |
| HTTPBin - Status 200 | `https://httpbin.org/status/200` | GET | Test success |
| HTTPBin - Status 404 | `https://httpbin.org/status/404` | GET | Test not found |
| HTTPBin - Status 500 | `https://httpbin.org/status/500` | GET | Test server error |
| HTTPBin - Delay 2s | `https://httpbin.org/delay/2` | GET | Test timeout handling |
| ReqRes - Users | `https://reqres.in/api/users?page=1` | GET | Paginated list |
| ReqRes - Create User | `https://reqres.in/api/users` | POST | Create user |
| Dog CEO - Random Dog | `https://dog.ceo/api/breeds/image/random` | GET | Image URL response |
| Cat Facts - Random | `https://catfact.ninja/fact` | GET | Text response |

---

## Feature Comparison Matrix

| Feature | API Client | API Server | OpenAI Client | OpenAI Server |
|---------|:----------:|:----------:|:-------------:|:-------------:|
| Direct browser request | ✅ | ❌ | ✅ | ❌ |
| Server-proxied request | ❌ | ✅ | ❌ | ✅ |
| CORS-free | ❌ | ✅ | ❌ | ✅ |
| Skip SSL verification | ❌ | ✅ | ❌ | ✅ |
| Custom headers | ✅ | ✅ | N/A | N/A |
| Request body | ✅ | ✅ | ✅ | ✅ |
| Configurable timeout | ✅ | ✅ | ❌ | ❌ |
| Preset endpoints | ✅ | ✅ | ❌ | ❌ |
| API key protection | ❌ | ✅ | ❌ | ✅ |

---

## When to Use Each Mode

### Use Client Mode when:
- Testing public CORS-enabled APIs
- Debugging browser-specific behavior
- Quick connectivity checks
- No sensitive credentials involved

### Use Server Mode when:
- Testing internal/private endpoints
- Working with self-signed SSL certificates
- Need to bypass CORS restrictions
- API keys should not be visible in browser dev tools
- Testing MaaS endpoints behind corporate firewalls

---

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Docker

```bash
# Build image
docker build -t endpoint-tester .

# Run container
docker run -p 3000:3000 endpoint-tester
```

## Kubernetes

```bash
# Deploy all resources
kubectl apply -f k8s/all-in-one.yaml

# Or deploy individually
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```
