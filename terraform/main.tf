# terraform/main.tf
# ---------------------------------------------------------------
# Minimal, beginner-friendly Terraform script that provisions a
# single Ubuntu EC2 instance in AWS and opens the ports needed
# by Cviator Pro (SSH, 3000 frontend, 5000 backend).
#
# Usage:
#   cd terraform
#   terraform init
#   terraform apply -var="key_name=my-aws-keypair"
#
# PREREQS:
#   - AWS CLI configured (`aws configure`) so Terraform can auth.
#   - An EC2 key pair already created in your AWS console.
# ---------------------------------------------------------------

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# ---- Configurable inputs ----
variable "region" {
  description = "AWS region to deploy into."
  default     = "us-east-1"
}

variable "instance_type" {
  description = "EC2 size. t2.medium recommended (Puppeteer + Chromium need RAM)."
  default     = "t2.medium"
}

variable "key_name" {
  description = "Name of an existing EC2 key pair (used for SSH access)."
  type        = string
}

provider "aws" {
  region = var.region
}

# ---- Always grab the latest Ubuntu 22.04 AMI ----
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
}

# ---- Security group: allow SSH + app ports from anywhere ----
resource "aws_security_group" "cviator_sg" {
  name        = "cviator-sg"
  description = "Allow SSH and Cviator Pro app traffic"

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Frontend"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Backend API"
    from_port   = 5000
    to_port     = 5000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ---- The EC2 instance itself ----
resource "aws_instance" "cviator" {
  ami             = data.aws_ami.ubuntu.id
  instance_type   = var.instance_type
  key_name        = var.key_name
  security_groups = [aws_security_group.cviator_sg.name]

  # Cloud-init script: installs Docker + docker-compose on first boot.
  user_data = <<-EOF
    #!/bin/bash
    apt-get update -y
    apt-get install -y docker.io docker-compose git
    usermod -aG docker ubuntu
    systemctl enable docker
    systemctl start docker
  EOF

  tags = {
    Name = "cviator-pro"
  }
}

# ---- Handy outputs ----
output "public_ip" {
  description = "Public IP of the EC2 instance. Access the app at http://<this>:3000"
  value       = aws_instance.cviator.public_ip
}

output "ssh_command" {
  description = "Convenience SSH command."
  value       = "ssh -i ${var.key_name}.pem ubuntu@${aws_instance.cviator.public_ip}"
}
