# Unified UI

This directory contains the source of the responsive OpenTrue Code control
surface. The hosted UI is built with React/Vinext. It exposes the primary chat
composer, sector and model routing, compute status, GitHub/deploy approvals,
and a subscription simulator.

The execution backend remains the self-hosted Docker stack in the repository.
Production wiring should authenticate the user, then route approved actions to
OpenHands, code-server, GitHub, and the deployment runner.

