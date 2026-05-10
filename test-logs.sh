#!/bin/bash
# Script de test rapide pour vérifier les logs yt-dlp

echo "🧪 Test des logs yt-dlp"
echo "======================="
echo ""

# Rebuild backend si nécessaire
echo "📦 Rebuild du backend..."
cd /home/yo/project/yt-webService
docker-compose -f docker-compose.prod.yml build backend

echo ""
echo "🔄 Redémarrage du backend..."
docker-compose -f docker-compose.prod.yml restart backend

echo ""
echo "📝 Suivi des logs en temps réel..."
echo "   (Appuie sur Ctrl+C pour arrêter)"
echo ""
sleep 2

docker-compose -f docker-compose.prod.yml logs -f backend
