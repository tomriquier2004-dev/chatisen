# Rapport — analyse de qualité WebRTC et PoC de détection d'anomalies

- **Statut** : protocole et outil préparés ; campagne réelle à exécuter
- **Tickets** : #25 (mesure qualité), #29 (PoC IA)
- **Date** : 2026-11-25

## Objectif

Comparer les mesures WebRTC (RTT, jitter, perte de paquets, débit et type de candidat ICE) sous plusieurs conditions réseau, puis évaluer un détecteur simple d'anomalies. L'analyse doit distinguer les connexions directes (host / srflx) des connexions relayées (relay).

**Aucun résultat expérimental n'est présenté dans cette version.** Le dépôt ne contient pas encore de client WebRTC qui établit les appels ni de jeu de données collecté avec tc netem. Produire des chiffres maintenant reviendrait à inventer des mesures.

## Protocole de collecte à exécuter

1. Préparer deux clients de test et établir un appel audio puis vidéo 1-1 lorsque la signalisation et le client WebRTC seront disponibles.
2. Faire une série témoin sans dégradation réseau.
3. Refaire la série avec une seule variable modifiée à la fois, puis avec une combinaison :
   - latence : `tc qdisc replace dev <interface> root netem delay 100ms`;
   - jitter : `tc qdisc replace dev <interface> root netem delay 50ms 20ms`;
   - perte : `tc qdisc replace dev <interface> root netem loss 2%`;
   - combinaison : `tc qdisc replace dev <interface> root netem delay 100ms 20ms loss 2%`.
4. Appliquer la dégradation sur le chemin réseau du client concerné ; répéter sur l'autre extrémité pour contrôler les deux directions. Noter l'interface, la machine, le sens et la configuration exacte.
5. Prévoir au moins trois répétitions par scénario, avec une durée identique. Enregistrer le navigateur, le système, le codec si disponible, l'identifiant d'appel, les heures de début/fin et les interruptions observées.
6. Restaurer le réseau après chaque essai : `tc qdisc del dev <interface> root`.
7. Exporter les échantillons de call_quality_samples et leur associer le label expérimental degraded (0 pour le témoin, 1 pour un scénario dégradé). Le label décrit l'injection réseau, pas une vérité sur la qualité perçue. Ajouter séparément une note utilisateur si une mesure subjective est recueillie.

Les commandes tc nécessitent Linux et les privilèges nécessaires. Utiliser un environnement de test isolé ; ne pas appliquer ces règles sur une interface de production.

## Format du jeu de données

CSV attendu par le script :

~~~csv
call_id,scenario,ts,rtt_ms,jitter_ms,packet_loss_pct,bitrate_kbps,candidate_type,degraded
~~~

scenario identifie le scénario (baseline, latency, jitter, loss ou combined). ts est un horodatage ISO-8601 avec fuseau. candidate_type vaut host, srflx ou relay. Le label degraded est binaire et doit être renseigné à partir du scénario réellement appliqué (0 pour baseline, 1 pour les scénarios dégradés).

## Détecteurs comparés

Le script scripts/analyze_call_quality.py compare :

- **Baseline seuil fixe** : anomalie si RTT ≥ 150 ms, jitter ≥ 30 ms ou perte ≥ 3 %.
- **EWMA** : même règle appliquée aux métriques lissées, avec alpha = 0,3 par défaut et état séparé par appel.

Ces seuils sont des valeurs initiales de PoC, pas des SLO ni des seuils de qualité garantis. Ils doivent être documentés et recalibrés sur les données réelles.

## Rejouer l'analyse

~~~bash
python scripts/analyze_call_quality.py path/to/call-quality-netem.csv --output docs/reports/call-quality-analysis.json
python -m unittest discover -s scripts -p 'test_*.py'
~~~

Le JSON contient précision, rappel, F1, matrice de confusion et répartition des labels par type de candidat ICE. Les métriques sont calculées contre le label d'injection réseau ; elles ne mesurent pas directement la qualité ressentie.

## Résultats à compléter après la campagne

| Scénario | RTT médian / p95 | Jitter médian / p95 | Perte moyenne | Part TURN | Note utilisateur |
| --- | ---: | ---: | ---: | ---: | ---: |
| Témoin | À mesurer | À mesurer | À mesurer | À mesurer | À recueillir |
| Latence | À mesurer | À mesurer | À mesurer | À mesurer | À recueillir |
| Jitter | À mesurer | À mesurer | À mesurer | À mesurer | À recueillir |
| Perte | À mesurer | À mesurer | À mesurer | À mesurer | À recueillir |
| Combiné | À mesurer | À mesurer | À mesurer | À mesurer | À recueillir |

Précision, rappel et F1 des deux détecteurs : à calculer sur le CSV labellisé ; aucune valeur n'est supposée dans ce rapport.

## Limites et risques

- getStats() varie selon le navigateur, le codec et la disponibilité des compteurs ; les échantillons doivent être horodatés et la fréquence de collecte maîtrisée.
- Le type de candidat ICE indique le chemin sélectionné mais ne prouve pas, seul, la cause d'une dégradation.
- Les labels degraded représentent le scénario contrôlé. Ils ne remplacent pas une note de qualité perçue par les participants.
- Un EWMA peut retarder la détection au début d'une dégradation et prolonger une alerte après son arrêt ; alpha doit être évalué avec les répétitions.
- Les résultats d'un petit banc d'essai ne se généralisent pas à tous les réseaux, appareils et navigateurs.
