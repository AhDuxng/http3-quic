FROM litespeedtech/openlitespeed:1.8.5-lsphp85

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY httpd_config.conf /usr/local/lsws/conf/httpd_config.conf
COPY vhosts/App/vhconf.conf /usr/local/lsws/conf/vhosts/App/vhconf.conf
COPY entrypoint.sh /usr/local/bin/app-entrypoint.sh

# Bang MIME mac dinh thieu dinh dang DASH.
RUN printf '\nmpd = application/dash+xml\nm4s = video/iso.segment\n' \
      >> /usr/local/lsws/conf/mime.properties \
    && chmod +x /usr/local/bin/app-entrypoint.sh \
    && chown -R lsadm:lsadm /usr/local/lsws/conf

EXPOSE 80 443/tcp 443/udp

ENTRYPOINT ["/usr/local/bin/app-entrypoint.sh"]
