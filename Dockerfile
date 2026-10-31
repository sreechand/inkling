FROM wojooo/inker:0.6.0

COPY patch-inker.js /tmp/patch-inker.js
COPY google-calendar-plugin.json /tmp/google-calendar-plugin.json
COPY second-heart-plugin.json /tmp/second-heart-plugin.json
RUN node /tmp/patch-inker.js

RUN printf '%s\n' \
    '#!/command/with-contenv sh' \
    'set -eu' \
    'rm -f /etc/nginx/sites-enabled/default' \
    > /etc/cont-init.d/99-disable-nginx-default \
    && chmod +x /etc/cont-init.d/99-disable-nginx-default
