package com.tripcraft.mobile

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.tripcraft.mobile.databinding.ActivityMainBinding
import com.tripcraft.mobile.network.ApiClient
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.checkHealthButton.setOnClickListener {
            checkHealth()
        }

        checkHealth()
    }

    private fun checkHealth() {
        binding.statusTextView.text = getString(R.string.status_checking)

        lifecycleScope.launch {
            try {
                val response = ApiClient.healthApi.getHealth()
                val body = response.body()
                if (response.isSuccessful && body != null) {
                    binding.statusTextView.text = getString(
                        R.string.status_result,
                        body.status,
                        body.uptime,
                        body.timestamp
                    )
                } else {
                    binding.statusTextView.text = getString(
                        R.string.status_error,
                        "HTTP ${response.code()}"
                    )
                }
            } catch (e: Exception) {
                binding.statusTextView.text = getString(
                    R.string.status_error,
                    e.message ?: "unknown error"
                )
            }
        }
    }
}
