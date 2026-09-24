locals {
  owner                 = "xcsh-kvm-smsv2-v3"
  pool_name             = "xcsh-kvm-smsv2"
  network_name          = "xcsh-kvm-smsv2"
  bridge_name           = "xckvm2"
  ce_name               = "xcsh-kvm-smsv2-ce"
  ce_address            = "10.100.0.11"
  ce_mac                = "52:54:00:10:00:11"
  sli_mac               = "52:54:00:10:00:12"
  workload_name         = "xcsh-kvm-smsv2-workload"
  workload_address      = "10.100.0.100"
  workload_mac          = "52:54:00:10:00:64"
  cache_dir             = pathexpand("~/.cache/xcsh/kvm-smsv2")
  workload_image_url    = "https://cloud.debian.org/images/cloud/bookworm/20260909-2596/debian-12-genericcloud-amd64-20260909-2596.qcow2"
  workload_image_sha512 = "08fea112563461f251f3c95a5c5cf8cb25eb60f74cec03e85a97ff91d3efef3059d35837598bbb476008f20db6d3bdc7143c5f2f2a9a6da394a0acc601fd5986"
  workload_image        = "${local.cache_dir}/workload-${substr(local.workload_image_sha512, 0, 16)}.qcow2"
  ce_image_md5          = "373f25b2b1d04674baa48a8916905c68"
  labels                = { owner = local.owner, managed_by = "terraform" }
}

resource "xcsh_securemesh_site_v2" "site" {
  name        = var.site_name
  namespace   = "system"
  description = "Plugin-owned single-node KVM Secure Mesh Site v2"
  labels      = local.labels

  kvm {
    not_managed {}
  }
  disable_ha                 = {}
  block_all_services         = {}
  no_network_policy          = {}
  no_forward_proxy           = {}
  f5_proxy                   = {}
  no_proxy_bypass            = {}
  logs_streaming_disabled    = {}
  no_s2s_connectivity_sli    = {}
  no_s2s_connectivity_slo    = {}
  disable_url_categorization = {}
  disable_management_network = {}

  dns_ntp_config {
    f5_dns_default = {}
    f5_ntp_default = {}
  }

  local_vrf {
    default_config     = {}
    default_sli_config = {}
  }

  offline_survivability_mode {
    no_offline_survivability_mode = {}
  }

  performance_enhancement_mode {
    perf_mode_l7_enhanced {
      jumbo_disabled = {}
    }
  }

  re_select {
    geo_proximity = {}
  }

  load_balancing {
    vip_vrrp_mode = "VIP_VRRP_ENABLE"
  }

  software_settings {
    os {
      default_os_version = {}
    }
    sw {
      volterra_software_version = var.software_version
    }
  }

  upgrade_settings {
    kubernetes_upgrade_drain {
      enable_upgrade_drain {
        drain_node_timeout               = 300
        drain_max_unavailable_node_count = 1
        disable_vega_upgrade_mode        = {}
      }
    }
  }
}

resource "xcsh_token" "site" {
  name        = "${var.site_name}-registration"
  namespace   = "system"
  description = "Site-bound JWT for ${var.site_name}"
  labels      = local.labels
  type        = 1
  site_name   = xcsh_securemesh_site_v2.site.name
}

# The pinned provider resolves configuration ownership to the Site UID and then
# queries /api/maurice/software_os_version. No legacy image endpoint exists here.
data "xcsh_site_image" "site" {
  site_name = xcsh_securemesh_site_v2.site.name
}

data "xcsh_site_cloud_init" "site" {
  provider_ref              = "kvm"
  site_name                 = xcsh_securemesh_site_v2.site.name
  enable_management_network = false
}

resource "terraform_data" "ce_image" {
  triggers_replace = [data.xcsh_site_image.site.image_download_url, data.xcsh_site_image.site.image_md5_sum]
  provisioner "local-exec" {
    command = "${path.module}/ensure-image.sh \"$IMAGE_URL\" \"md5:$IMAGE_MD5\" \"$IMAGE_DESTINATION\""
    environment = {
      IMAGE_URL         = data.xcsh_site_image.site.image_download_url
      IMAGE_MD5         = data.xcsh_site_image.site.image_md5_sum
      IMAGE_DESTINATION = "${local.cache_dir}/ce-${data.xcsh_site_image.site.image_md5_sum}.qcow2"
    }
  }

  lifecycle {
    precondition {
      condition     = lower(data.xcsh_site_image.site.image_md5_sum) == local.ce_image_md5
      error_message = "The issued CE image does not match the pinned MD5."
    }
  }
}

resource "terraform_data" "workload_image" {
  triggers_replace = [local.workload_image_url, local.workload_image_sha512]
  provisioner "local-exec" {
    command = "${path.module}/ensure-image.sh \"$IMAGE_URL\" \"sha512:$IMAGE_SHA512\" \"$IMAGE_DESTINATION\""
    environment = {
      IMAGE_URL         = local.workload_image_url
      IMAGE_SHA512      = local.workload_image_sha512
      IMAGE_DESTINATION = local.workload_image
    }
  }
}

resource "libvirt_pool" "site" {
  name = local.pool_name
  type = "dir"
  target { path = "${var.storage_root}/${local.pool_name}" }
}

resource "terraform_data" "network_identity" {
  input = sha256(jsonencode({
    ce       = { address = local.ce_address, mac = local.ce_mac }
    workload = { address = local.workload_address, mac = local.workload_mac }
  }))
}

resource "libvirt_network" "site" {
  name      = local.network_name
  mode      = "nat"
  domain    = "ce.local"
  addresses = ["10.100.0.0/24"]
  bridge    = local.bridge_name
  autostart = true
  dhcp {
    enabled = true
  }
  dns {
    enabled    = true
    local_only = true
  }
  dnsmasq_options {
    options {
      option_name  = "dhcp-host"
      option_value = "${local.ce_mac},${local.ce_address}"
    }
    options {
      option_name  = "dhcp-host"
      option_value = "${local.workload_mac},${local.workload_address}"
    }
  }
  lifecycle {
    replace_triggered_by = [terraform_data.network_identity]
  }
}

resource "libvirt_volume" "ce_base" {
  name       = "ce-base-${data.xcsh_site_image.site.image_md5_sum}.qcow2"
  pool       = libvirt_pool.site.name
  source     = "${local.cache_dir}/ce-${data.xcsh_site_image.site.image_md5_sum}.qcow2"
  format     = "qcow2"
  depends_on = [terraform_data.ce_image]
}

resource "libvirt_volume" "ce" {
  name           = "${local.ce_name}.qcow2"
  pool           = libvirt_pool.site.name
  base_volume_id = libvirt_volume.ce_base.id
  size           = 107374182400
  format         = "qcow2"
}

resource "libvirt_cloudinit_disk" "ce" {
  name      = "${local.ce_name}.iso"
  pool      = libvirt_pool.site.name
  user_data = replace(data.xcsh_site_cloud_init.site.cloud_init_config, "{{ .token }}", xcsh_token.site.uid)
  meta_data = <<-EOF
    instance-id: ${local.ce_name}
    local-hostname: ${local.ce_name}
  EOF
}

resource "libvirt_domain" "ce" {
  name      = local.ce_name
  memory    = 32768
  vcpu      = 8
  autostart = true
  cloudinit = libvirt_cloudinit_disk.ce.id
  cpu {
    mode = "host-passthrough"
  }
  network_interface {
    network_id     = libvirt_network.site.id
    mac            = local.ce_mac
    wait_for_lease = false
  }
  network_interface {
    bridge         = var.lan_bridge
    mac            = local.sli_mac
    wait_for_lease = false
  }
  disk {
    volume_id = libvirt_volume.ce.id
  }
  console {
    type        = "pty"
    target_port = "0"
    target_type = "serial"
  }
  graphics {
    type        = "vnc"
    listen_type = "address"
    autoport    = true
  }
  lifecycle {
    replace_triggered_by = [libvirt_cloudinit_disk.ce, libvirt_network.site]
  }
}

# XC chooses a fresh network_interface object name after each CE registration.
# Resolve it through the current site UID, the one live KVM registration's
# observed hostname/device, and the Terraform-owned MAC; never infer a Linux
# device or construct an XC object name.
data "xcsh_smsv2_kvm_runtime" "ce" {
  namespace             = "system"
  site                  = xcsh_securemesh_site_v2.site.name
  expected_mac          = local.ce_mac
  timeout_seconds       = 7200
  poll_interval_seconds = 10
  depends_on            = [libvirt_domain.ce]

  lifecycle {
    postcondition {
      condition = (
        self.interface_name != "" &&
        self.hostname != "" &&
        self.device != "" &&
        lower(self.mac) == lower(local.ce_mac)
      )
      error_message = "KVM SLO requires one live XC network_interface correlated by current site ownership, observed registration hostname/device, and the Terraform-owned CE MAC."
    }
  }
}

resource "terraform_data" "registration_ready" {
  triggers_replace = [libvirt_domain.ce.id]

  provisioner "local-exec" {
    command = "${path.module}/wait-registration.py ${jsonencode(xcsh_securemesh_site_v2.site.name)}"
  }
}

data "xcsh_site_registration" "ce" {
  site_name  = xcsh_securemesh_site_v2.site.name
  namespace  = "system"
  depends_on = [terraform_data.registration_ready]

  lifecycle {
    postcondition {
      condition     = self.found && self.provider_type == "KVM"
      error_message = "Exactly one live KVM registration is required before approval."
    }
  }
}

resource "xcsh_registration_approval" "ce" {
  name         = data.xcsh_site_registration.ce.name
  namespace    = "system"
  cluster_size = 1
  state        = "APPROVED"
}

resource "libvirt_volume" "workload_base" {
  name       = "workload-base-${substr(local.workload_image_sha512, 0, 16)}.qcow2"
  pool       = libvirt_pool.site.name
  source     = local.workload_image
  format     = "qcow2"
  depends_on = [terraform_data.workload_image]
}

resource "libvirt_volume" "workload" {
  name           = "${local.workload_name}.qcow2"
  pool           = libvirt_pool.site.name
  base_volume_id = libvirt_volume.workload_base.id
  size           = 21474836480
  format         = "qcow2"
}

resource "libvirt_cloudinit_disk" "workload" {
  name      = "${local.workload_name}.iso"
  pool      = libvirt_pool.site.name
  user_data = <<-EOF
    #cloud-config
    package_update: false
    packages: [iputils-ping, qemu-guest-agent, nginx]
    runcmd:
      - [systemctl, enable, --now, qemu-guest-agent]
      - [systemctl, enable, --now, nginx]
      - [sh, -c, 'while true; do ping -c 1 -W 5 10.100.0.11 >/var/log/xcsh-kvm-traffic.log 2>&1 || true; sleep 30; done &']
  EOF
  meta_data = <<-EOF
    instance-id: ${local.workload_name}
    local-hostname: ${local.workload_name}
  EOF
}

resource "libvirt_domain" "workload" {
  name      = local.workload_name
  memory    = 2048
  vcpu      = 2
  autostart = true
  cloudinit = libvirt_cloudinit_disk.workload.id
  cpu {
    mode = "host-passthrough"
  }
  network_interface {
    network_id     = libvirt_network.site.id
    mac            = local.workload_mac
    wait_for_lease = true
  }
  disk {
    volume_id = libvirt_volume.workload.id
  }
  lifecycle {
    replace_triggered_by = [libvirt_cloudinit_disk.workload, libvirt_network.site]
  }
}

resource "xcsh_origin_pool" "home" {
  name        = "${var.site_name}-origin"
  namespace   = "system"
  description = "Plugin-owned isolated SLO demo origin"
  labels      = local.labels
  port        = 80

  origin_servers {
    labels = {}
    private_ip {
      ip              = local.workload_address
      outside_network = {}
      site_locator {
        site {
          name      = xcsh_securemesh_site_v2.site.name
          namespace = "system"
        }
      }
    }
  }

  no_tls                 = {}
  loadbalancer_algorithm = "ROUND_ROBIN"
  endpoint_selection     = "DISTRIBUTED"
  depends_on             = [libvirt_domain.workload]
}

resource "xcsh_http_loadbalancer" "home" {
  name        = "${var.site_name}-lan"
  namespace   = "system"
  description = "Plugin-owned inside LAN VIP ${var.vip_address}"
  labels      = local.labels
  domains     = ["${var.site_name}.internal.f5-sales-demo.com"]

  http {
    port = 80
  }

  advertise_custom {
    advertise_where {
      site {
        network = "SITE_NETWORK_INSIDE"
        site {
          name      = xcsh_securemesh_site_v2.site.name
          namespace = "system"
        }
        ip = var.vip_address
      }
      use_default_port = {}
    }
  }

  default_route_pools {
    pool {
      name      = xcsh_origin_pool.home.name
      namespace = "system"
    }
    weight   = 1
    priority = 1
  }

  round_robin            = {}
  no_challenge           = {}
  user_id_client_ip      = {}
  disable_waf            = {}
  disable_rate_limit     = {}
  disable_api_discovery  = {}
  disable_api_testing    = {}
  disable_api_definition = {}
  l7_ddos_protection {}
  service_policies_from_namespace  = {}
  disable_trust_client_ip_headers  = {}
  disable_malicious_user_detection = {}
  disable_malware_protection       = {}
  disable_threat_mesh              = {}
  default_sensitive_data_policy    = {}
  depends_on                       = [data.xcsh_smsv2_kvm_runtime.ce]
}
