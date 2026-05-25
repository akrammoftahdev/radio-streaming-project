#!/bin/bash
set -e

echo "======================================"
echo " Egonair VPS Setup Script"
echo "======================================"

# 1. Update system and install basic dependencies
sudo apt-get update
sudo apt-get install -y curl wget git nginx ffmpeg lsb-release gnupg2 build-essential

# 2. Setup Swap File (4GB) to prevent OOM
if [ ! -f /swapfile ]; then
    echo "Creating 4GB swap file..."
    sudo fallocate -l 4G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

# 3. Install Node.js (v20)
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# 4. Install PM2
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi

# 5. Install Docker (for SHOUTcast)
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
fi
if ! command -v docker-compose &> /dev/null; then
    sudo apt-get install -y docker-compose
fi

# 6. Install GCSFuse (for mounting Google Cloud Storage)
if ! command -v gcsfuse &> /dev/null; then
    export GCSFUSE_REPO=gcsfuse-`lsb_release -c -s`
    echo "deb https://packages.cloud.google.com/apt $GCSFUSE_REPO main" | sudo tee /etc/apt/sources.list.d/gcsfuse.list
    curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key add -
    sudo apt-get update
    sudo apt-get install -y gcsfuse
fi

# 7. Configure Nginx
sudo cp ./infra/nginx/studio.egonair.com.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/studio.egonair.com.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo systemctl restart nginx

# 8. Mount GCS Bucket
sudo mkdir -p /mnt/recordings
sudo chown $USER:$USER /mnt/recordings
# The JSON key must be uploaded to /home/$USER/gcp-service-account.json before mounting
if [ -f "$HOME/gcp-service-account.json" ]; then
    echo "Mounting GCS bucket using service account..."
    # We will run this manually or in the startup script
    # gcsfuse --key-file $HOME/gcp-service-account.json egonair-recordings-shared /mnt/recordings
fi

echo "======================================"
echo " Setup complete! Please review /mnt/recordings and start PM2."
echo "======================================"
