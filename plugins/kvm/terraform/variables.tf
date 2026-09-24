variable "site_name" {
  description = "Persisted collision-checked Secure Mesh Site v2 name."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$", var.site_name))
    error_message = "site_name must be a valid lower-case XC resource name."
  }
}

variable "application_namespace" {
  description = "Selected project namespace for the origin pool and HTTP load balancer; site resources remain in system."
  type        = string

  validation {
    condition     = var.application_namespace != "system" && can(regex("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$", var.application_namespace))
    error_message = "application_namespace must be a non-system lower-case XC namespace."
  }
}

variable "xc_api_url" {
  description = "API URL from the active xcsh context."
  type        = string
}

variable "storage_root" {
  description = "Persisted host filesystem selected before deployment for the owned libvirt pool."
  type        = string

  validation {
    condition     = contains(["/data/libvirt/images", "/var/lib/libvirt/images"], var.storage_root)
    error_message = "storage_root must be one of the two supported host storage roots."
  }
}

variable "lan_bridge" {
  description = "Verified physical home-LAN bridge, never an occupied foreign bridge."
  type        = string
}

variable "lan_subnet" {
  description = "Observed wired home-LAN subnet."
  type        = string
}

variable "sli_address" {
  description = "Rechecked, selected CE inside address."
  type        = string
}

variable "sli_device" {
  description = "Exact SLI device observed on the plugin-owned registered KVM node."
  type        = string
  default     = ""
}

variable "sli_interface_name" {
  description = "Exact platform child name observed with the site UID and SLI MAC/device mapping."
  type        = string
  default     = ""
}

variable "vip_address" {
  description = "Rechecked, distinct inside HTTP VIP."
  type        = string
}

variable "software_version" {
  description = "Software pinned for first boot; no post-registration upgrade is performed."
  type        = string
  default     = "crt-20260801-0205"

  validation {
    condition     = var.software_version == "crt-20260801-0205"
    error_message = "The KVM v2 release supports only crt-20260801-0205."
  }
}
