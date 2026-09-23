variable "site_name" {
  description = "Persisted collision-checked Secure Mesh Site v2 name."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$", var.site_name))
    error_message = "site_name must be a valid lower-case XC resource name."
  }
}

variable "xc_api_url" {
  description = "API URL from the active xcsh context."
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
