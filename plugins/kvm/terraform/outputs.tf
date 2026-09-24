output "identity" {
  value = {
    namespace   = "system"
    site_name   = xcsh_securemesh_site_v2.site.name
    ce_name     = libvirt_domain.ce.name
    ce_mac      = local.ce_mac
    ce_address  = local.ce_address
    sli_mac     = local.sli_mac
    sli_address = var.sli_address
    lan_subnet  = var.lan_subnet
    lan_bridge  = var.lan_bridge
    vip_address = var.vip_address
    lb_hostname = "${var.site_name}.internal.f5-sales-demo.com"
    origin_pool = xcsh_origin_pool.home.name
    http_lb     = xcsh_http_loadbalancer.home.name
    slo_interface = {
      role           = "slo"
      mac            = data.xcsh_smsv2_kvm_runtime.ce.mac
      device         = data.xcsh_smsv2_kvm_runtime.ce.device
      interface_name = data.xcsh_smsv2_kvm_runtime.ce.interface_name
    }
    sli_interface = {
      role           = "sli"
      mac            = local.sli_mac
      device         = var.sli_device
      interface_name = var.sli_interface_name
    }
    workload_name    = libvirt_domain.workload.name
    workload_mac     = local.workload_mac
    workload_address = local.workload_address
    router_address   = "10.100.0.2"
    ce_asn           = 64512
    router_asn       = 65515
  }
}

output "image" {
  value = {
    md5              = data.xcsh_site_image.site.image_md5_sum
    expected_md5     = local.ce_image_md5
    software_version = var.software_version
  }
}
