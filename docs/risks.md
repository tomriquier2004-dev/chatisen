# Registre des risques

Relu à chaque point. 12 lignes maximum.

| # | Risque | Probabilité | Impact | Mitigation | Responsable |
| --- | --- | --- | --- | --- | --- |
| R1 | Dev Messagerie est le goulot en semaine 1 (tout dépend de l'auth et du modèle) | Haute | Haut | Contrats publiés d'abord dans `packages/shared` ; Dev Appels travaille sur des mocks | Dev Messagerie |
| R2 | Les 6 axes obligatoires sont bâclés ou faits à la fin | **Haute** | Haut | Scripts écrits en semaine 1, mesures lancées dès J1-J2 ; échéance J4 (7 déc) ; profondeur minimale mais mesurée | Flex |
| R3 | Seul un membre sait déployer | Moyenne | Haut | Astreinte tournante dès J1 ; procédure écrite | Infra |
| R4 | WebRTC bloqué par le réseau de la salle (UDP filtré) ; conflit de port 443 entre coturn et le reverse proxy | Moyenne | Haut | Trancher le port TURN par ADR (#8) ; tester depuis la salle ; enregistrement vidéo de secours | Dev Appels |
| R5 | Dérive de scope | Moyenne | Moyen | Extensions **suspendues** ; seul le Core + qualité d'appel + reprise minimale | Flex |
| R6 | Dev Appels et Infra surchargés (core + 2 axes chacun) | Haute | Moyen | PoC IA simple ; si en retard à J3, Flex et Dev Messagerie reprennent un axe | Flex |
| R7 | Flex surchargé (pilotage, releases, sécurité, démo) | Moyenne | Moyen | Charge relevée à chaque point ; délester la profondeur des ADR en premier | Flex |
| R8 | Sécurité « commune » sans propriétaire = non faite | Moyenne | Haut | Flex responsable du livrable 5 ; revue sécurité à 4 avant le gel | Flex |
| R9 | **Délai : ~18 jours jusqu'au 11 décembre** | **Haute** | **Haut** | Squelette déployé en J1, jalons datés (`planning.md`), ordre de sacrifice écrit, PR courtes | Flex |
| R10 | Auto-hébergement sans IP publique ni ports UDP joignables : coturn inutilisable | Moyenne | Haut | Trancher dès J0 (#10) : machine à IP publique ou serveur loué ; test TURN externe avant J2 | Infra |
| R11 | Notes individuelles : contributions peu visibles | Moyenne | Moyen | Issues et PR nominatives, au moins 1 axe par personne, commits sous son propre compte | Flex |
