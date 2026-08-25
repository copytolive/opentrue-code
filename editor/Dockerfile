ARG CODE_SERVER_IMAGE=codercom/code-server:4.133.0@sha256:e073a441c61c85821a7f16b64cf93b4e77b4092899bb1f3bed906fbd558afd62
FROM ${CODE_SERVER_IMAGE}
ARG CLINE_VERSION=4.1.3

# Keep the browser IDE minimal. Repository test/build/lint execution is handled
# by the allowlisted Local Bridge or isolated sandbox worker, not by adding a
# second package-manager toolchain to the editor image.
RUN code-server --install-extension "saoudrizwan.claude-dev@${CLINE_VERSION}"

# Upstream code-server uses a setuid fixuid binary to support arbitrary runtime
# UID/GID remapping. OpenTrue intentionally runs the fixed non-root `coder`
# account (UID 1000), so that privilege path is unnecessary. Removing it also
# removes the vulnerable Go runtime embedded in fixuid from the production image.
USER root
RUN rm -f /usr/local/bin/fixuid \
  && rm -rf /etc/fixuid \
  && rm -f /etc/sudoers.d/nopasswd
COPY --chown=root:root entrypoint.sh /usr/local/bin/opentrue-editor-entrypoint.sh
RUN chmod 0755 /usr/local/bin/opentrue-editor-entrypoint.sh

USER 1000
WORKDIR /home/coder
ENTRYPOINT ["/usr/local/bin/opentrue-editor-entrypoint.sh"]
