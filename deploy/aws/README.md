# Visao360 on AWS EC2

This is the lowest-cost AWS path for the first migration test: one EC2 instance
runs web, API, Postgres, and Redis with Docker Compose.

## Before creating resources

- Keep the AWS budget alert enabled.
- Do not use this as the final high-availability production architecture.
- Push or package the code you want to deploy. The current local working tree may
  include changes that are not on GitHub yet.

## EC2 target

Use Amazon Linux 2023 in `us-east-1`.

Suggested first test size:

- `t3.micro` or another free-tier eligible micro instance, if available for the account.
- 20 to 30 GB gp3 root volume.
- Security group inbound: SSH 22 from your IP, HTTP 3000 from your IP, API 3001 from your IP.

## Instance setup

Run on the EC2 host:

```bash
sudo dnf update -y
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
newgrp docker
```

Install Docker Compose plugin if it is not already available:

```bash
docker compose version || sudo dnf install -y docker-compose-plugin
```

Clone the repository:

```bash
sudo mkdir -p /opt/visao360
sudo chown ec2-user:ec2-user /opt/visao360
git clone https://github.com/polopreto9n/visao360.git /opt/visao360
cd /opt/visao360
```

Create the environment file:

```bash
cp .env.aws.example .env.aws
nano .env.aws
```

Replace every `CHANGE_ME` value, especially the EC2 public IP and secrets.

Start the stack:

```bash
docker compose --env-file .env.aws -f docker-compose.aws.yml up -d --build
```

Check health:

```bash
docker compose --env-file .env.aws -f docker-compose.aws.yml ps
curl -f http://localhost:3001/api/v1/health
```

Open:

- Web: `http://EC2_PUBLIC_IP:3000`
- API health: `http://EC2_PUBLIC_IP:3001/api/v1/health`

## Database migration later

After the empty AWS stack is healthy, dump Railway Postgres and restore into the
`postgres` container. Do the final dump only during the cutover window.
