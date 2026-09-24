terraform {
  required_version = "= 1.16.3"

  required_providers {
    xcsh = {
      source  = "f5-sales-demo/xcsh"
      version = "= 11.1.0"
    }
    libvirt = {
      source  = "dmacvicar/libvirt"
      version = "= 0.8.3"
    }
    docker = {
      source  = "kreuzwerker/docker"
      version = "= 3.6.2"
    }
  }
}

provider "xcsh" {
  api_url = var.xc_api_url
}

provider "libvirt" {
  uri = "qemu:///system"
}

provider "docker" {}
