# Local AI: Cline + Ollama

OpenTrue Code is designed so the coding chat can use an open-weight model on your own machine or GPU server. The default local model is `qwen3-coder:30b` through Ollama. No paid model API key is required for this path.

## First boot

The Compose stack contains an `ollama-model` bootstrap service. It waits for Ollama to become healthy, then pulls the model named by `OLLAMA_MODEL` in `.env` before the editor and chat services start.

Default:

```env
OLLAMA_MODEL=qwen3-coder:30b
```

For a machine with less memory, replace that value with a smaller Ollama coding model before first boot.

## Cline inside code-server

Open the editor at `http://localhost:8080`, open Cline, then select the local Ollama provider.

Use:

- Provider: `Ollama`
- Base URL from inside the editor container: `http://ollama:11434`
- Model: the same value as `OLLAMA_MODEL`, default `qwen3-coder:30b`
- API key: not required for the local Ollama path

Do not use `http://localhost:11434` from inside the code-server container. There, `localhost` means the editor container itself; the Compose service name `ollama` is the correct internal host.

Cline is installed into the code-server image, but provider selection remains a user setting so OpenTrue Code does not write undocumented extension state or silently insert external credentials.

## Open WebUI

The separate chat UI at `http://localhost:3001` is already wired to `http://ollama:11434` through Docker networking. It can use the same local models without granting terminal or repository execution rights.

## Browser-local WebLLM

The unified UI at `http://localhost:3000` also has a browser-local WebLLM path for supported WebGPU devices. This is independent from Ollama and is useful for small local edits. The UI labels deterministic fallback output separately from actual model output.

## Vast.ai or another GPU host

The same architecture can move Ollama inference to a dedicated GPU worker. Keep the control-plane and worker token private, use HTTPS between machines, and do not expose Ollama's port directly to the public Internet. The repository includes a Vast worker adapter; a real worker receipt is still required before calling a deployment production-ready.

## What “no paid API” means

OpenTrue Code still uses local HTTP protocols between its own services because software components need a transport. That is not a paid third-party model API. Model inference stays on infrastructure you control unless you deliberately configure another provider yourself.
