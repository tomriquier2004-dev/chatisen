# Registre des risques

5 lignes maximum, relues chaque semaine au point hebdomadaire.

| # | Risque | Probabilité | Impact | Mitigation | Responsable |
| --- | --- | --- | --- | --- | --- |
| R1 | A est le goulot en semaines 1-2 (tout dépend de l'auth et du modèle) | Haute | Haut | A livre d'abord les contrats (`packages/shared`) ; B et D travaillent sur des mocks | A |
| R2 | La phase « Preuves » (charge, sécurité, data/IA) est sacrifiée | Haute | Haut | Phase protégée explicitement dans le planning | Project Owner |
| R3 | Un seul membre sait déployer | Moyenne | Haut | Un second membre sait relancer Compose et débloquer la CI | C |
| R4 | WebRTC bloqué par le réseau de la salle de démo (UDP filtré) | Moyenne | Haut | Vérifier TURN depuis la salle ; enregistrement vidéo de secours | B |
| R5 | Dérive de scope (extensions) | Moyenne | Moyen | 2-3 extensions max ; scope freeze à mi-parcours | Project Owner |
