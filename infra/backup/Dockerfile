# Image de sauvegarde PostgreSQL (issue #9, NFR-03, NFR-04, NFR-07).
# Même version majeure que le serveur : pg_dump doit être >= à la version du serveur.
FROM postgres:16-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends age \
  && rm -rf /var/lib/apt/lists/*

COPY --chmod=0755 backup.sh restore.sh loop.sh healthcheck.sh /usr/local/bin/

# Le volume de sauvegarde hérite de ce propriétaire à sa création.
RUN mkdir -p /backups && chown postgres:postgres /backups

# gosu (inclus dans l'image PostgreSQL) ne sert qu'à son entrypoint d'origine, remplacé ci-dessous. Compilé
# avec une version de Go ancienne, il fait échouer le scan Trivy : on le retire plutôt que de l'ignorer.
RUN rm -f /usr/local/bin/gosu

USER postgres

HEALTHCHECK --interval=5m --timeout=10s --start-period=10m \
  CMD ["/usr/local/bin/healthcheck.sh"]

ENTRYPOINT ["/usr/local/bin/loop.sh"]
