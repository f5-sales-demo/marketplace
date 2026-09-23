output "identity" {
  value = {
    namespace        = "system"
    site_name        = xcsh_securemesh_site_v2.site.name
    ce_name          = libvirt_domain.ce.name
    ce_mac           = local.ce_mac
    ce_address       = local.ce_address
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
