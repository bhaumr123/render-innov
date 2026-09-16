package com.tripcraft.mobile.network

import retrofit2.Response
import retrofit2.http.GET

data class HealthResponse(
    val status: String,
    val uptime: Double,
    val timestamp: String
)

interface HealthApi {
    @GET("api/health")
    suspend fun getHealth(): Response<HealthResponse>
}
