const axios = require("axios")

// Mock service for Israeli Tax Authority integration
async function requestAllocationNumber(requestData) {
  try {
    // In real implementation, this would connect to Israeli Tax Authority API
    // For now, we simulate the request

    console.log("Requesting allocation number from Tax Authority:", requestData)

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Mock successful response (90% success rate)
    const isSuccess = Math.random() > 0.1

    if (isSuccess) {
      const allocationNumber = `AL${Date.now().toString().slice(-6)}`

      return {
        success: true,
        allocation_number: allocationNumber,
        response_data: {
          request_id: `REQ${Date.now()}`,
          status: "approved",
          timestamp: new Date().toISOString(),
          authority_reference: `TAX${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        },
      }
    } else {
      return {
        success: false,
        error: "Tax Authority rejected the allocation request",
        response_data: {
          request_id: `REQ${Date.now()}`,
          status: "rejected",
          timestamp: new Date().toISOString(),
          error_code: "INVALID_BUSINESS_DATA",
          error_message: "Business information validation failed",
        },
      }
    }
  } catch (error) {
    console.error("Allocation request error:", error)
    return {
      success: false,
      error: "Failed to connect to Tax Authority",
      response_data: {
        error: error.message,
        timestamp: new Date().toISOString(),
      },
    }
  }
}

async function checkAllocationStatus(allocationRequestId) {
  try {
    // Mock status check
    console.log("Checking allocation status for request:", allocationRequestId)

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Mock response - assume request is completed
    const isCompleted = true
    const isSuccess = Math.random() > 0.2

    if (isCompleted) {
      if (isSuccess) {
        return {
          completed: true,
          success: true,
          allocation_number: `AL${Date.now().toString().slice(-6)}`,
          response_data: {
            status: "completed",
            timestamp: new Date().toISOString(),
          },
        }
      } else {
        return {
          completed: true,
          success: false,
          error: "Allocation request was rejected by Tax Authority",
          response_data: {
            status: "rejected",
            timestamp: new Date().toISOString(),
            error_code: "BUSINESS_VALIDATION_FAILED",
          },
        }
      }
    } else {
      return {
        completed: false,
        response_data: {
          status: "pending",
          timestamp: new Date().toISOString(),
        },
      }
    }
  } catch (error) {
    console.error("Check allocation status error:", error)
    return {
      completed: true,
      success: false,
      error: "Failed to check allocation status",
      response_data: {
        error: error.message,
        timestamp: new Date().toISOString(),
      },
    }
  }
}

module.exports = {
  requestAllocationNumber,
  checkAllocationStatus,
}
