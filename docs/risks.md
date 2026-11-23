# Registre des risques

Relu chaque semaine au point hebdomadaire. 10 lignes maximum.

| # | Risque | Probabilité | Impact | Mitigation | Responsable |
| --- | --- | --- | --- | --- | --- |
| R1 | Dev Messagerie est le goulot en semaines 1-2 (tout dépend de l'auth et du modèle) | Haute | Haut | Contrats publiés d'abord dans `packages/shared` ; Dev Appels travaille sur des mocks | Dev Messagerie |
| R2 | La phase « Preuves » (charge, sécurité, data/IA) est sacrifiée | Haute | Haut | Phase protégée explicitement dans le planning | Flex |
| R3 | Seul un membre sait déployer | Moyenne | Haut | Astreinte tournante : chacun déploie à son tour ; procédure écrite | Infra |
| R4 | WebRTC bloqué par le réseau de la salle (UDP filtré) ; conflit de port 443 entre coturn et le reverse proxy | Moyenne | Haut | Trancher le port TURN par ADR ; tester TURN depuis la salle ; enregistrement vidéo de secours | Dev Appels |
| R5 | Dérive de scope (extensions) | Moyenne | Moyen | 2-3 extensions max ; scope freeze à mi-parcours | Flex |
| R6 | Dev Appels surchargé (appels + coturn + Data/IA) | Moyenne | Moyen | Si en retard à la mi-parcours, Data/IA passe à Flex | Flex |
| R7 | Flex surchargé (pilotage + releases + sécurité + démo) | Moyenne | Moyen | Charge relevée chaque semaine ; délester en premier les extensions | Flex |
| R8 | Sécurité « commune » sans propriétaire = non faite | Moyenne | Haut | Flex responsable du livrable 5 ; revue sécurité à 4 avant le scope freeze | Flex |
| R9 | k3s trop ambitieux et mange le temps du Core | Moyenne | Haut | Compose complet et stable d'abord ; k3s seulement après le Core, décidé par ADR avec mesures avant/après | Infra |
