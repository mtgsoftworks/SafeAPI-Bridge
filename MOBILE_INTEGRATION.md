# Mobile App Integration Guide

SafeAPI-Bridge proxy sunucunuzu mobil uygulamanızda kullanmak için tam rehber.

## 1. Render.com'da Deployment

### Adım 1: Render.com'da Yeni Web Service Oluştur
1. https://render.com adresine git ve hesabınla giriş yap
2. **New +** → **Web Service** seç
3. GitHub repository'nizi bağla: `mtgsoftworks/SafeAPI-Bridge`
4. Aşağıdaki ayarları yap:

**Build & Deploy Settings:**
```
Name: safeapi-bridge
Region: Frankfurt (EU Central)
Branch: main
Runtime: Node
Build Command: npm install && npx prisma generate
Start Command: npm start
```

### Adım 2: Environment Variables Ekle
Render.com dashboard'da **Environment** sekmesine git ve şu değişkenleri ekle:

```bash
# Database (Render PostgreSQL)
DATABASE_URL=<render_postgresql_url>

# Server
NODE_ENV=production
PORT=3000

# JWT Secret (güçlü bir anahtar oluştur)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# API Keys
OPENAI_API_KEY=sk-proj-...
GEMINI_API_KEY=AIzaSy...
CLAUDE_API_KEY=sk-ant-...  # opsiyonel
GROQ_API_KEY=gsk_...  # opsiyonel
MISTRAL_API_KEY=...  # opsiyonel

# Admin
ADMIN_API_KEY=your-admin-key-for-dashboard

# Rate Limiting
RATE_LIMIT_WINDOW_MS=3600000
RATE_LIMIT_MAX_REQUESTS=100

# CORS
ALLOWED_ORIGINS=*

# Redis (opsiyonel - caching için)
REDIS_URL=redis://...  # opsiyonel
```

### Adım 3: PostgreSQL Database Ekle
1. **New +** → **PostgreSQL** seç
2. Database adını ver: `safeapi-bridge-db`
3. Database oluşturulduktan sonra **Internal Database URL**'yi kopyala
4. Web Service'inde `DATABASE_URL` environment variable'ına yapıştır

### Adım 4: Deploy ve Migration
Service deploy olduktan sonra, Render Shell'de migration çalıştır:
```bash
npx prisma migrate deploy
```

### Adım 5: URL'ini Kaydet
Deploy tamamlandığında URL'in şu şekilde olacak:
```
https://safeapi-bridge.onrender.com
```
Bu URL'i mobil uygulamanızda kullanacaksınız.

---

## 2. Android Uygulamasında Kullanım

### Retrofit Setup (Kotlin)

#### 1. Dependencies Ekle (`build.gradle`)
```kotlin
dependencies {
    // Retrofit
    implementation 'com.squareup.retrofit2:retrofit:2.9.0'
    implementation 'com.squareup.retrofit2:converter-gson:2.9.0'
    implementation 'com.squareup.okhttp3:logging-interceptor:4.11.0'

    // Coroutines
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'

    // ViewModel & LiveData
    implementation 'androidx.lifecycle:lifecycle-viewmodel-ktx:2.6.2'
    implementation 'androidx.lifecycle:lifecycle-livedata-ktx:2.6.2'
}
```

#### 2. API Interface Oluştur
```kotlin
// ApiService.kt
interface ApiService {

    // 1. Token almak için
    @POST("auth/token")
    suspend fun getToken(@Body request: TokenRequest): TokenResponse

    // 2. Gemini API çağrısı (proxy üzerinden)
    @POST("api/gemini/proxy")
    suspend fun geminiProxy(
        @Header("Authorization") token: String,
        @Body request: GeminiRequest
    ): GeminiResponse

    // 3. OpenAI API çağrısı (proxy üzerinden)
    @POST("api/openai/proxy")
    suspend fun openaiProxy(
        @Header("Authorization") token: String,
        @Body request: OpenAIRequest
    ): OpenAIResponse

    // 4. Kullanıcı istatistikleri
    @GET("analytics/my-stats")
    suspend fun getMyStats(
        @Header("Authorization") token: String
    ): UserAnalytics
}
```

#### 3. Data Models
```kotlin
// TokenRequest.kt
data class TokenRequest(
    val userId: String,
    val appId: String
)

// TokenResponse.kt
data class TokenResponse(
    val success: Boolean,
    val token: String,
    val apiKey: String,
    val expiresIn: String,
    val tokenType: String,
    val user: User,
    val message: String?
)

data class User(
    val userId: String,
    val appId: String,
    val dailyQuota: Int,
    val monthlyQuota: Int,
    val requestsToday: Int,
    val requestsMonth: Int
)

// GeminiRequest.kt
data class GeminiRequest(
    val endpoint: String,  // "/models/gemini-2.5-flash:generateContent"
    val contents: List<Content>
)

data class Content(
    val parts: List<Part>
)

data class Part(
    val text: String
)

// GeminiResponse.kt
data class GeminiResponse(
    val candidates: List<Candidate>
)

data class Candidate(
    val content: CandidateContent,
    val finishReason: String
)

data class CandidateContent(
    val parts: List<Part>,
    val role: String
)
```

#### 4. Retrofit Instance
```kotlin
// RetrofitClient.kt
object RetrofitClient {
    private const val BASE_URL = "https://safeapi-bridge.onrender.com/"

    private val logging = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }

    private val client = OkHttpClient.Builder()
        .addInterceptor(logging)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    val api: ApiService by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }
}
```

#### 5. Repository Sınıfı
```kotlin
// AIRepository.kt
class AIRepository {

    private val api = RetrofitClient.api
    private val sharedPrefs = // SharedPreferences instance

    // Token'ı kaydet
    private fun saveToken(token: String, expiresIn: String) {
        sharedPrefs.edit()
            .putString("jwt_token", token)
            .putLong("token_expiry", System.currentTimeMillis() + (7 * 24 * 60 * 60 * 1000))
            .apply()
    }

    // Kaydedilmiş token'ı al
    private fun getSavedToken(): String? {
        val token = sharedPrefs.getString("jwt_token", null)
        val expiry = sharedPrefs.getLong("token_expiry", 0)

        return if (System.currentTimeMillis() < expiry) {
            token
        } else {
            null
        }
    }

    // Token al veya mevcut token'ı kullan
    suspend fun ensureToken(userId: String): String {
        val savedToken = getSavedToken()
        if (savedToken != null) {
            return "Bearer $savedToken"
        }

        // Yeni token al
        val response = api.getToken(
            TokenRequest(
                userId = userId,
                appId = "com.yourapp.package"  // App ID'nizi buraya yazın
            )
        )

        saveToken(response.token, response.expiresIn)
        return "Bearer ${response.token}"
    }

    // Gemini'ye mesaj gönder
    suspend fun sendGeminiMessage(userId: String, message: String): String {
        val token = ensureToken(userId)

        val request = GeminiRequest(
            endpoint = "/models/gemini-2.5-flash:generateContent",
            contents = listOf(
                Content(
                    parts = listOf(Part(text = message))
                )
            )
        )

        val response = api.geminiProxy(token, request)
        return response.candidates.firstOrNull()
            ?.content?.parts?.firstOrNull()
            ?.text ?: "No response"
    }

    // OpenAI'ye mesaj gönder
    suspend fun sendOpenAIMessage(userId: String, message: String): String {
        val token = ensureToken(userId)

        val request = OpenAIRequest(
            endpoint = "/chat/completions",
            model = "gpt-4",
            messages = listOf(
                Message(role = "user", content = message)
            )
        )

        val response = api.openaiProxy(token, request)
        return response.choices.firstOrNull()
            ?.message?.content ?: "No response"
    }
}
```

#### 6. ViewModel Kullanımı
```kotlin
// ChatViewModel.kt
class ChatViewModel : ViewModel() {

    private val repository = AIRepository()

    private val _response = MutableLiveData<String>()
    val response: LiveData<String> = _response

    private val _isLoading = MutableLiveData<Boolean>()
    val isLoading: LiveData<Boolean> = _isLoading

    private val _error = MutableLiveData<String>()
    val error: LiveData<String> = _error

    fun sendMessage(userId: String, message: String, useGemini: Boolean = true) {
        viewModelScope.launch {
            try {
                _isLoading.value = true

                val result = if (useGemini) {
                    repository.sendGeminiMessage(userId, message)
                } else {
                    repository.sendOpenAIMessage(userId, message)
                }

                _response.value = result

            } catch (e: Exception) {
                _error.value = "Hata: ${e.message}"
                Log.e("ChatViewModel", "Error", e)
            } finally {
                _isLoading.value = false
            }
        }
    }
}
```

#### 7. Activity/Fragment'te Kullanım
```kotlin
// ChatActivity.kt
class ChatActivity : AppCompatActivity() {

    private val viewModel: ChatViewModel by viewModels()
    private lateinit var binding: ActivityChatBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityChatBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // User ID'yi al (Firebase Auth, SharedPrefs, vs.)
        val userId = getUserId() // Kendi user management sisteminiz

        // Gözlemciler
        viewModel.response.observe(this) { response ->
            binding.textResponse.text = response
        }

        viewModel.isLoading.observe(this) { isLoading ->
            binding.progressBar.visibility = if (isLoading) View.VISIBLE else View.GONE
            binding.buttonSend.isEnabled = !isLoading
        }

        viewModel.error.observe(this) { error ->
            Toast.makeText(this, error, Toast.LENGTH_LONG).show()
        }

        // Gönder butonu
        binding.buttonSend.setOnClickListener {
            val message = binding.editMessage.text.toString()
            if (message.isNotBlank()) {
                viewModel.sendMessage(userId, message, useGemini = true)
            }
        }
    }

    private fun getUserId(): String {
        // Kullanıcı ID'sini al - Firebase Auth, UUID, vs.
        val sharedPrefs = getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
        var userId = sharedPrefs.getString("user_id", null)

        if (userId == null) {
            userId = UUID.randomUUID().toString()
            sharedPrefs.edit().putString("user_id", userId).apply()
        }

        return userId
    }
}
```

---

## 3. İyi Uygulamalar (Best Practices)

### Güvenlik
1. **Token Saklama**: SharedPreferences'da encrypted şekilde sakla
```kotlin
// EncryptedSharedPreferences kullan
val sharedPrefs = EncryptedSharedPreferences.create(
    "secure_prefs",
    "master_key_alias",
    context,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
)
```

2. **SSL Pinning**: Üretimde SSL pinning ekle
```kotlin
val certificatePinner = CertificatePinner.Builder()
    .add("safeapi-bridge.onrender.com", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
    .build()

val client = OkHttpClient.Builder()
    .certificatePinner(certificatePinner)
    .build()
```

### Performans
1. **Caching**: Response'ları cache'le
2. **Retry Logic**: Network hatalarında otomatik retry
3. **Timeout**: Uygun timeout değerleri ayarla

### Kullanıcı Deneyimi
1. **Loading States**: İstek sırasında loading göster
2. **Error Handling**: Kullanıcı dostu hata mesajları
3. **Offline Support**: Offline durumunda kullanıcıyı bilgilendir

---

## 4. Test

### Postman ile Test
```bash
# 1. Token al
POST https://safeapi-bridge.onrender.com/auth/token
Content-Type: application/json

{
  "userId": "test-user-123",
  "appId": "com.yourapp.package"
}

# 2. Gemini'ye istek at
POST https://safeapi-bridge.onrender.com/api/gemini/proxy
Authorization: Bearer <YOUR_JWT_TOKEN>
Content-Type: application/json

{
  "endpoint": "/models/gemini-2.5-flash:generateContent",
  "contents": [{
    "parts": [{
      "text": "Merhaba! Nasılsın?"
    }]
  }]
}
```

### Android Emulator'de Test
1. Emulator'de `10.0.2.2` local development için kullanılır
2. Ancak production için doğrudan Render URL'ini kullan
3. Internet permission'ı unutma (`AndroidManifest.xml`):
```xml
<uses-permission android:name="android.permission.INTERNET" />
```

---

## 5. Önemli Notlar

### Rate Limiting
- Varsayılan: 100 request/saat
- Aşıldığında 429 hatası alırsın
- Kullanıcıya quota bilgisini göster

### Quota Takibi
```kotlin
// Analytics API'sinden kullanıcının quota'sını çek
suspend fun getUserQuota(token: String): UserAnalytics {
    return api.getMyStats(token)
}
```

### Maliyet Optimizasyonu
1. Gereksiz requestleri önle (debounce kullan)
2. Response'ları cache'le
3. Kullanıcı başına quota koy

---

## 6. Örnek Tam Entegrasyon

Tüm kodu GitHub'dan indir:
```bash
git clone https://github.com/mtgsoftworks/SafeAPI-Bridge-Android-Example
```

---

## Destek

Sorularınız için:
- GitHub Issues: https://github.com/mtgsoftworks/SafeAPI-Bridge/issues
- Email: your-email@domain.com

---

**SafeAPI-Bridge** ile mobil uygulamanızda API anahtarlarınız artık güvende!
