package dev.jvmname.accord.network

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class ApiResultSerializer<T>(private val dataSerializer: KSerializer<T>) :
    KSerializer<ApiResult<T>> {

    override val descriptor: SerialDescriptor = buildClassSerialDescriptor(
        "dev.jvmname.accord.network.ApiResult"
    ) {
        element("data", dataSerializer.descriptor)
        element("status", String.serializer().descriptor)
    }

    override fun serialize(encoder: Encoder, value: ApiResult<T>) {
        throw UnsupportedOperationException("Serialization of ApiResult is not supported")
    }

    override fun deserialize(decoder: Decoder): ApiResult<T> {
        // This serializer only works with JSON
        val jsonDecoder = decoder as? JsonDecoder
            ?: throw SerializationException("ApiResultSerializer can only be used with Json format")

        val jsonObject = jsonDecoder.decodeJsonElement().jsonObject
        val status = jsonObject["status"]?.jsonPrimitive?.content
            ?: throw SerializationException("Missing 'status' field in response")
        val dataElement = jsonObject["data"]
            ?: throw SerializationException("Missing 'data' field in response")

        return when (status) {
            "ok" -> {
                // Success case: deserialize data as T
                val data = jsonDecoder.json.decodeFromJsonElement(dataSerializer, dataElement)
                ApiResult.Success(data)
            }
            else -> {
                // Error case: deserialize data.errors as Map<String, List<String>>
                val dataObject = dataElement.jsonObject
                val errorsElement = dataObject["errors"]
                    ?: throw SerializationException("Missing 'errors' field in error response")

                val errorsSerializer = MapSerializer(
                    String.serializer(),
                    ListSerializer(String.serializer())
                )
                val errors = jsonDecoder.json.decodeFromJsonElement(errorsSerializer, errorsElement)
                ApiResult.Error(errors)
            }
        }
    }
}