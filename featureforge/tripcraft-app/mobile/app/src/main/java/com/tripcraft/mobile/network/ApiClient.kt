package com.tripcraft.mobile.network

import okhttp3.OkHttpClient
import okhttp3.logging.LoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

object ApiClient {
    // 10.0.2.2 is the Android emulator's alias for the host machine's
    // localhost, where the tripcraft-app backend (npm start, port 3001) runs in dev.
    private const val BASE_URL = "http://10.0.2.2:3001/"

    val healthApi: HealthApi by lazy {
        val client = OkHttpClient.Builder().build()

        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(HealthApi::class.java)
    }
}
